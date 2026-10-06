"""Offline prototype. No outbound adapter, billing mutation or provider network calls."""
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
import sqlite3
from statistics import median

PREMIUM = 'SesCoVXlNu7qTSBol1gs'

class ReviewRequired(ValueError):
    pass


def number(value, name, positive=False):
    if isinstance(value, bool):
        raise ReviewRequired(name)
    try:
        result = Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ReviewRequired(name)
    if not result.is_finite() or result < 0 or (positive and result <= 0):
        raise ReviewRequired(name)
    return result


def money(value):
    return str(value.quantize(Decimal('.01')))


@dataclass(frozen=True)
class Context:
    """Must be supplied by future trusted authentication middleware, never request body."""
    agency: str
    location: str
    actor: str


class Store:
    def __init__(self, connection):
        self.db = connection
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS membership (
          agency TEXT NOT NULL, location TEXT NOT NULL, actor TEXT NOT NULL,
          PRIMARY KEY(agency,location,actor));
        CREATE TABLE IF NOT EXISTS selected_client (
          agency TEXT NOT NULL, location TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
          selected_by TEXT NOT NULL, decision_reference TEXT NOT NULL,
          PRIMARY KEY(agency,location));
        CREATE TABLE IF NOT EXISTS record (
          agency TEXT NOT NULL, location TEXT NOT NULL, id TEXT NOT NULL,
          kind TEXT NOT NULL, payload TEXT NOT NULL,
          PRIMARY KEY(agency,location,id));
        ''')

    def authorize(self, ctx):
        if not all((ctx.agency, ctx.location, ctx.actor)):
            raise PermissionError('Missing tenant context')
        member = self.db.execute('SELECT 1 FROM membership WHERE agency=? AND location=? AND actor=?',
                                 (ctx.agency, ctx.location, ctx.actor)).fetchone()
        row = self.db.execute('SELECT enabled,selected_by,decision_reference FROM selected_client WHERE agency=? AND location=?',
                              (ctx.agency, ctx.location)).fetchone()
        if not member or not row or row[0] != 1 or not row[1] or not row[2]:
            raise PermissionError('Tenant membership and owner-selected client enablement required')

    def put(self, ctx, ident, kind, payload):
        self.authorize(ctx)
        self.db.execute('INSERT INTO record VALUES(?,?,?,?,?) ON CONFLICT(agency,location,id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload',
                        (ctx.agency,ctx.location,ident,kind,json.dumps(payload,sort_keys=True)))
        self.db.commit()

    def get(self, ctx, ident):
        self.authorize(ctx)
        row = self.db.execute('SELECT payload FROM record WHERE agency=? AND location=? AND id=?',
                              (ctx.agency,ctx.location,ident)).fetchone()
        return json.loads(row[0]) if row else None


def outreach_gate(evidence):
    """Draft eligibility only. This never authorizes delivery."""
    if evidence.get('opt_out') is True or evidence.get('dnd') is True:
        return {'status':'STOP_OPT_OUT','eligible':False,'outbound_enabled':False}
    required = ('consent_channel_verified','dnd_checked','opt_out_checked',
                'local_time_policy_approved','within_local_time_window',
                'property_verified','owner_authority_verified','buy_box_approved')
    missing = [key for key in required if evidence.get(key) is not True]
    if evidence.get('dnd') is not False: missing.append('dnd_clear')
    if evidence.get('opt_out') is not False: missing.append('opt_out_clear')
    return {'status':'NEEDS_REVIEW' if missing else 'DRAFT_READY',
            'eligible':not missing,'missing':missing,'outbound_enabled':False}


def asset_route(asset, units=None):
    if asset == 'house': return 'house_sales'
    if asset == 'land': return 'land_sales_per_acre'
    if asset == 'multifamily':
        if not isinstance(units,int) or isinstance(units,bool): raise ReviewRequired('unit_count')
        if 2 <= units <= 4: return 'small_multifamily_sales_and_income'
        if units >= 5: return 'commercial_multifamily_noi_cap'
    raise ReviewRequired('asset_class')


def validate_source(source, synthetic, primary_comp=False):
    if not isinstance(source,dict) or not source.get('reference') or not source.get('retrieved_at'):
        raise ReviewRequired('source provenance')
    try:
        retrieved = datetime.fromisoformat(source['retrieved_at'])
        if retrieved.tzinfo is None or retrieved > datetime.now(timezone.utc):
            raise ReviewRequired('source timestamp')
    except (ValueError,TypeError): raise ReviewRequired('source timestamp')
    if synthetic:
        if source.get('synthetic') is not True: raise ReviewRequired('SYNTHETIC label required')
    elif source.get('synthetic') is not False or not source.get('provider') or (primary_comp and source.get('provider') != 'DealMachine'):
        raise ReviewRequired('DealMachine primary comps required')


def valuation(subject, comps, policy, as_of, synthetic=False):
    """Policy has no defaults. All thresholds must be reviewer approved."""
    if policy.get('approved') is not True or not policy.get('approval_reference'):
        raise ReviewRequired('approved comp policy')
    route = asset_route(subject.get('asset'),subject.get('units'))
    if route == 'commercial_multifamily_noi_cap':
        raise ReviewRequired('5+ uses sourced NOI/cap; sales comps supporting only')
    measure = 'acres' if subject['asset']=='land' else 'sqft'
    size = number(subject.get(measure),measure,True)
    radius = number(policy.get('radius_miles'),'radius',True)
    age = number(policy.get('max_age_days'),'age',True)
    tolerance = number(policy.get('size_tolerance'),'tolerance')
    if tolerance >= 1: raise ReviewRequired('size_tolerance must be below 1')
    minimum = policy.get('min_comps')
    if not isinstance(minimum,int) or isinstance(minimum,bool) or minimum < 3:
        raise ReviewRequired('min_comps must be at least 3')
    qualified, excluded, seen = [], [], set()
    for comp in comps:
        try:
            ident = comp['id']
            if not isinstance(ident,str) or not ident or ident in seen: raise ReviewRequired('duplicate/missing comp id')
            seen.add(ident)
            validate_source(comp.get('source'),synthetic,primary_comp=True)
            if comp.get('asset') != subject['asset'] or comp.get('sale_verified') is not True:
                raise ReviewRequired('asset or sale verification')
            if subject['asset']=='multifamily' and comp.get('units') != subject.get('units'):
                raise ReviewRequired('unit count mismatch')
            if subject['asset']!='land' and comp.get('renovated_comparable') is not True: raise ReviewRequired('renovated condition verification')
            if subject['asset']=='land':
                for field in ('zoning','access','utilities','flood_status'):
                    if not subject.get(field) or comp.get(field) != subject[field]: raise ReviewRequired(field)
            sold = date.fromisoformat(comp['sale_date'])
            days = (as_of-sold).days
            distance = number(comp.get('distance_miles'),'distance')
            csize = number(comp.get(measure),measure,True)
            price = number(comp.get('sale_price'),'price',True)
            if days < 0 or Decimal(days)>age or distance>radius or abs(csize/size-1)>tolerance:
                raise ReviewRequired('outside approved comp policy')
            qualified.append((ident,price/csize,comp['source']))
        except (ReviewRequired,KeyError,ValueError,TypeError) as error:
            excluded.append({'id':comp.get('id'),'reason':str(error)})
    if len(qualified)<minimum: raise ReviewRequired('insufficient verified primary comps')
    value = median([c[1] for c in qualified])*size
    return {'status':'INTERNAL_DRAFT','method':route,'value':money(value),'synthetic':synthetic,
            'label':'SYNTHETIC — TEST ONLY' if synthetic else 'SOURCE-BACKED INTERNAL REVIEW',
            'used_comp_ids':[c[0] for c in qualified], 'sources':[c[2] for c in qualified],
            'excluded':excluded,'outbound_enabled':False}


def strategies(value, facts, approved, route):
    """Dollar expenses provided explicitly; no default profit/fee/cap/rent."""
    if approved.get('approved') is not True or not approved.get('reference'):
        raise ReviewRequired('buy-box and strategy assumptions approval')
    v=number(value,'value',True) if route!='commercial_multifamily_noi_cap' else Decimal(0)
    def n(key, positive=False): return number(facts.get(key),key,positive)
    flip=v-sum((n(k) for k in ('repairs','holding','purchase_closing','selling','profit','risk_buffer')),Decimal(0))
    wholesale=flip-n('assignment_fee')
    noi=n('annual_rent')*(1-n('vacancy_rate'))-n('annual_operating_expenses')
    if n('vacancy_rate')>=1: raise ReviewRequired('vacancy_rate')
    debt=n('annual_debt_service',True)
    cap=n('cap_rate',True)
    if cap>=1: raise ReviewRequired('cap_rate')
    result={'status':'INTERNAL_DRAFT','priority':'wholesale','wholesale_ceiling':money(wholesale),
            'flip_ceiling':money(flip),'rental_noi':money(noi),'rental_cash_flow':money(noi-debt),
            'dscr':str((noi/debt).quantize(Decimal('.0001'))),'income_value':money(noi/cap),
            'creative_finance':'NEEDS_REVIEW — exact financing terms, debt verification and legal review required',
            'outbound_enabled':False,'assumption_reference':approved['reference']}
    if route=='commercial_multifamily_noi_cap':
        result['primary_value']=result['income_value']
        result['wholesale_ceiling']=money(noi/cap-sum((n(k) for k in ('repairs','holding','purchase_closing','selling','profit','risk_buffer','assignment_fee')),Decimal(0)))
        result['flip_ceiling']=None
    return result


def offer_digest(packet):
    required=('agency','location','property_id','property_address','recipient_id','recipient_destination',
              'price','currency','terms','analysis_id','analysis_version','buy_box_approval_reference')
    if any(packet.get(k) in (None,'',{},[]) for k in required): raise ReviewRequired('incomplete exact offer packet')
    number(packet['price'],'price',True)
    if packet['currency']!='USD': raise ReviewRequired('currency')
    encoded=json.dumps(packet,sort_keys=True,separators=(',',':'),allow_nan=False)
    return hashlib.sha256(encoded.encode()).hexdigest()


def review_offer(ctx, packet, approval, now=None):
    """Evidence check for internal draft only. No signing/sending function exists."""
    if packet.get('agency')!=ctx.agency or packet.get('location')!=ctx.location:
        raise PermissionError('offer tenant mismatch')
    digest=offer_digest(packet)
    now=now or datetime.now(timezone.utc)
    try:
        expires=datetime.fromisoformat(approval['expires'])
        approved_at=datetime.fromisoformat(approval['approved_at'])
        time_ok=approved_at.tzinfo is not None and expires.tzinfo is not None and approved_at<=now<expires
    except (KeyError,ValueError,TypeError): time_ok=False
    allowed=(approval.get('digest')==digest and approval.get('human_actor')==ctx.actor and
             approval.get('agency')==ctx.agency and approval.get('location')==ctx.location and
             approval.get('explicit') is True and approval.get('used') is False and time_ok and
             packet.get('synthetic') is False and packet.get('analysis_reviewed') is True)
    return {'status':'HUMAN_REVIEWED_DRAFT' if allowed else 'NEEDS_REVIEW',
            'digest':digest,'outbound_enabled':False,'execution_implemented':False}


def property_gate(subject):
    route=asset_route(subject.get('asset'),subject.get('units'))
    required=['property_id','address','parcel','state','identity_source']
    required += {'house_sales':['condition_report','repair_bid'],
                 'land_sales_per_acre':['acres','zoning','access','utilities','flood_status','survey_or_boundary_source'],
                 'small_multifamily_sales_and_income':['sqft','rent_roll','leases','operating_statement','condition_report','repair_bid'],
                 'commercial_multifamily_noi_cap':['rent_roll','leases','operating_statement','cap_rate_source','occupancy_source','condition_report','repair_bid']}[route]
    missing=[k for k in required if subject.get(k) in (None,'',{},[])]
    if subject.get('verified') is not True: missing.append('verified_property_identity')
    if subject.get('asset')=='house' and subject.get('units') not in (None,1): missing.append('house_unit_count_conflict')
    return {'route':route,'status':'NEEDS_REVIEW' if missing else 'DRAFT_READY','missing':missing}


def underwrite(store,ctx,request):
    """Trusted application service entry. Pure functions above are internal math helpers."""
    store.authorize(ctx)
    if request.get('agency')!=ctx.agency or request.get('location')!=ctx.location:
        raise PermissionError('request tenant mismatch')
    subject=request.get('subject',{})
    gate=property_gate(subject)
    if gate['missing']: return dict(gate,outbound_enabled=False)
    if request.get('provider_reuse_rights_confirmed') is not True and request.get('synthetic') is not True:
        return {'status':'NEEDS_REVIEW','missing':['DealMachine paid multi-client reuse rights and coverage'],'outbound_enabled':False}
    try:
        synthetic=request.get('synthetic') is True
        route=gate['route']
        facts=request.get('facts',{})
        if route=='commercial_multifamily_noi_cap':
            # Every income/cap input is linked to evidence; AVM and house comps cannot substitute.
            for key in ('annual_rent','vacancy_rate','annual_operating_expenses','annual_debt_service','cap_rate'):
                validate_source(request.get('fact_sources',{}).get(key),synthetic)
            value=None  # commercial primary value derives solely from sourced NOI/cap
            valuation_result={'method':route,'sources':request['fact_sources'],'synthetic':synthetic}
        else:
            valuation_result=valuation(subject,request.get('comps',[]),request.get('comp_policy',{}),date.fromisoformat(request['as_of']),synthetic)
            value=valuation_result['value']
        # All cost, profit and fee inputs require explicit provenance, even when zero.
        for key in ('repairs','holding','purchase_closing','selling','profit','risk_buffer','assignment_fee',
                    'annual_rent','vacancy_rate','annual_operating_expenses','annual_debt_service','cap_rate'):
            validate_source(request.get('fact_sources',{}).get(key),synthetic)
        strategy=strategies(value,facts,request.get('assumptions_approval',{}),route)
        if route=='commercial_multifamily_noi_cap': valuation_result['value']=strategy['primary_value']
        return {'status':'INTERNAL_DRAFT','valuation':valuation_result,'strategies':strategy,
                'synthetic':synthetic,'not_an_offer':True,'outbound_enabled':False}
    except (ReviewRequired,KeyError,ValueError,TypeError) as error:
        return {'status':'NEEDS_REVIEW','missing':[str(error)],'outbound_enabled':False}
