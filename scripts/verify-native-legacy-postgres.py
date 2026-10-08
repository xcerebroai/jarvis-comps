"""Disposable synthetic-only local integration; never reads connection secrets."""
from pathlib import Path
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path('/opt/homebrew/opt/postgresql@16/bin')
socket = Path('/tmp/jarvis-acq-test-pg-socket')
diagnose = sys.argv[1:] == ['--diagnose']
if sys.argv[1:] not in ([], ['--diagnose']):
    raise SystemExit('Only --diagnose is supported')
log = root / 'evidence' / ('postgres-integration-diagnostic.txt' if diagnose else 'postgres-integration-verified.txt')
diagnostic = root / 'src' / 'lib' / '.native-legacy-diagnostic.ts'
if diagnostic.exists():
    raise SystemExit('Refusing to overwrite an existing diagnostic file')
result = {'started': False, 'tcpDisabled': False, 'integrationPassed': False, 'stopped': False, 'cleaned': False}
for tool in ['initdb', 'pg_ctl', 'createdb', 'psql']:
    if not (pg / tool).is_file():
        raise SystemExit('Required installed PostgreSQL binary absent: ' + tool)
if socket.is_symlink():
    raise SystemExit('Refusing symlink socket directory')
existed = socket.exists()
old_mode = stat.S_IMODE(socket.stat().st_mode) if existed else None
if existed and (socket.stat().st_uid != os.getuid() or any(socket.iterdir())):
    raise SystemExit('Refusing existing active/nonempty or foreign socket directory')
cluster = Path(tempfile.mkdtemp(prefix='jarvis-native-pg-', dir='/tmp'))
env = {'PATH': '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C', 'PGPASSFILE': '/dev/null', 'PGSERVICEFILE': '/dev/null'}
started = False
with log.open('w') as output:
    def run(args, label):
        output.write(label + '\n'); output.flush()
        return subprocess.run([str(a) for a in args], cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, check=True, timeout=60)
    try:
        socket.mkdir(exist_ok=True, mode=0o700)
        socket.chmod(0o700)
        run([pg / 'initdb', '-D', cluster / 'data', '--encoding=UTF8', '--no-locale', '--auth-local=trust', '--auth-host=reject'], 'Initialize empty disposable PostgreSQL cluster; local trust restricted to private filesystem socket.')
        options = f"-k {socket} -p 55439 -c listen_addresses='' -c unix_socket_permissions=0700"
        run([pg / 'pg_ctl', '-D', cluster / 'data', '-l', cluster / 'server.log', '-o', options, '-w', 'start'], 'Start Unix-socket-only server, no TCP listener.')
        started = True
        result['started'] = True
        run([pg / 'createdb', '-h', socket, '-p', '55439', 'neondb'], 'Create synthetic empty database neondb.')
        check = subprocess.run([str(pg / 'psql'), '-X', '-h', str(socket), '-p', '55439', '-d', 'neondb', '-A', '-t', '-c', "SELECT current_database() = 'neondb' AND inet_server_addr() IS NULL AND current_setting('listen_addresses') = '';"], env=env, capture_output=True, text=True, check=True, timeout=20)
        if check.stdout.strip() != 't':
            raise RuntimeError('Isolated local target verification failed')
        result['tcpDisabled'] = True
        output.write('Verified database identity, null inet server address, empty TCP listen_addresses.\n')
        run([pg / 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '55439', '-d', 'neondb', '-f', root / 'prisma' / 'acquisitions-headless-proposed.sql'], 'Apply checked-in six-table schema only to the fresh local database.')
        test_file = root / 'src' / 'lib' / 'headless-acquisitions.local-test.ts'
        if diagnose:
            source = test_file.read_text()
            source = source.replace('void main().catch(()=>{', "void main().catch((error:unknown)=>{if(error instanceof assert.AssertionError){console.error(JSON.stringify({kind:'AssertionError',actual:typeof error.actual==='number'?error.actual:null,expected:typeof error.expected==='number'?error.expected:null,frames:error.stack?.split('\\n').filter(line=>line.trim().startsWith('at ')).slice(0,3)}));}")
            diagnostic.write_text(source)
            test_file = diagnostic
        run(['/opt/homebrew/bin/node', '--import', 'tsx', '--test', test_file], 'Run legacy synthetic integration against the verified local socket only.')
        if not diagnose:
            run(['/opt/homebrew/bin/node', '--import', 'tsx', '--test', root / 'src' / 'lib' / 'acquisition-machine-auth.local-test.ts'], 'Run new quote authentication SQL checks in the same disposable local database.')
        result['integrationPassed'] = True
    except Exception as error:
        # No connection exception or environment content in output.
        output.write('Local verification did not complete: ' + type(error).__name__ + '\n')
        server_log = cluster / 'server.log'
        if not started and server_log.exists():
            output.write(server_log.read_text())
    finally:
        if started:
            try:
                run([pg / 'pg_ctl', '-D', cluster / 'data', '-m', 'fast', '-w', 'stop'], 'Stop temporary PostgreSQL server.')
                result['stopped'] = True
            except Exception:
                output.write('STOP FAILED: temporary cluster retained at ' + str(cluster) + '\n')
        if diagnostic.exists():
            diagnostic.unlink()
        if not started or result['stopped']:
            shutil.rmtree(cluster)
            if existed:
                socket.chmod(old_mode)
            else:
                socket.rmdir()
            result['cleaned'] = True
        output.write(json.dumps(result, sort_keys=True) + '\n')
(root / 'evidence' / 'postgres-integration-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, sort_keys=True))
raise SystemExit(0 if result['integrationPassed'] and result['stopped'] and result['cleaned'] else 1)
