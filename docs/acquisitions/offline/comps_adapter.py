"""Offline validation contract for reusing Jarvis Comps. No HTTP/provider calls.

The existing public response lacks sufficient provenance. This adapter accepts
only an enriched envelope from future trusted server middleware, not seller text.
It does not treat existing app ARV/AVM/confidence as an approved acquisition value.
"""
from datetime import date
from core import ReviewRequired, valuation


def house_analysis(envelope, policy, as_of: date):
    if envelope.get('synthetic') not in (True, False):
        raise ReviewRequired('explicit synthetic state')
    synthetic = envelope['synthetic']
    subject = envelope.get('subject', {})
    if subject.get('asset') != 'house' or not subject.get('dm_property_id'):
        raise ReviewRequired('verified house identity and asset route')
    if subject.get('identity_verified') is not True:
        raise ReviewRequired('subject identity verification')
    records = envelope.get('comps')
    if not isinstance(records, list):
        raise ReviewRequired('raw source records required, not model ARV')
    allowed_sale_types = policy.get('verified_sale_types')
    if not isinstance(allowed_sale_types,list) or not allowed_sale_types:
        raise ReviewRequired('approved verified sale types')
    mapped, rejected = [], []
    for row in records:
        if not isinstance(row,dict):
            raise ReviewRequired('invalid comp record')
        # Never admit estimated sales prices, even if accidentally allowlisted.
        sale_type = str(row.get('saleType','')).strip()
        if 'estimated' in sale_type.lower() or sale_type not in allowed_sale_types:
            rejected.append({'id':row.get('id'),'reason':'unverified sale type'})
            continue
        if row.get('propertyType') != subject.get('propertyType') or not subject.get('propertyType'):
            rejected.append({'id':row.get('id'),'reason':'missing/mismatched property type'})
            continue
        mapped.append({
            'id':row.get('id'), 'asset':'house', 'sale_verified':row.get('sale_verified'),
            'renovated_comparable':row.get('renovated_comparable'),
            'sale_price':row.get('salePrice'), 'sale_date':row.get('saleDate'),
            'sqft':row.get('sqft'), 'distance_miles':row.get('distanceMiles'),
            'source':row.get('source'),
        })
    result = valuation({'asset':'house','sqft':subject.get('sqft')},mapped,policy,as_of,synthetic)
    result.update(property_id=subject['dm_property_id'], analysis_version=envelope.get('analysis_version'))
    if not result['analysis_version']:
        raise ReviewRequired('persisted analysis version')
    result['excluded'] = rejected + result['excluded']
    return result
