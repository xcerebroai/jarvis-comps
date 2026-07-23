export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-bold tracking-tight ${className}`}>
      <span className="text-white">Jarvis</span>
      <span className="text-accent">Comps</span>
    </span>
  );
}
