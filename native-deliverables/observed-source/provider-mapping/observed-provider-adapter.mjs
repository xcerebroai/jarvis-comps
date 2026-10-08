/**
 * Observed DealMachine projection boundary. No I/O, credentials, valuation,
 * native writes, or authorization. This is not the Atlas normalized contract.
 */
export const OBSERVED_CONTRACT = 'jarvis.observed-dealmachine.v1';
const COMPS_ENDPOINT = 'POST https://api.v2.dealmachine.com/v1/comps';
const ADDRESS_ENDPOINT = 'POST https://api.v2.dealmachine.com/v1/enrichment/address';
const MAX_JSON_LENGTH = 250_000;
const numericFields = new Set(['bedrooms', 'bathrooms', 'sqft', 'year_built', 'lot_size', 'last_sale_price', 'sale_price', 'distance', 'price_per_sqft', 'days_on_market', 'living_area_sqft', 'lot_size_acres', 'lot_size_sqft', 'num_bedrooms', 'num_bathrooms', 'num_units', 'last_sale_amount']);
const integerFields = new Set(['bedrooms', 'year_built', 'days_on_market', 'num_bedrooms', 'num_units']);
const categoryFields = new Set(['property_type', 'building_condition', 'last_sale_doc_type']);
const dateFields = new Set(['sale_date', 'last_sale_date']);
const subjectFields = ['address', 'display_line_1', 'display_line_2', 'bedrooms', 'bathrooms', 'sqft', 'property_type', 'year_built', 'lot_size', 'last_sale_price', 'last_sale_date'];
const compFields = [...subjectFields.filter(key => !key.startsWith('last_sale_')), 'type', 'sale_price', 'sale_date', 'sale_type', 'distance', 'price_per_sqft', 'days_on_market'];
const addressFields = ['full_address', 'property_type', 'living_area_sqft', 'lot_size_acres', 'lot_size_sqft', 'num_bedrooms', 'num_bathrooms', 'num_units', 'year_built', 'building_condition', 'last_sale_doc_type', 'last_sale_price', 'last_sale_amount', 'last_sale_date'];
const reasons = ['UNITS_AND_CURRENCY_UNVERIFIED', 'SALE_VERIFICATION_UNAVAILABLE', 'SOURCE_PROVENANCE_INCOMPLETE', 'CLIENT_POLICY_NOT_BOUND'];
const own = (object, key) => Object.hasOwn(object, key);
function fail(code) { throw new Error(code); }
function check(condition, code) { if (!condition) fail(code); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function text(value) { return typeof value === 'string' && value.length > 0 && value.length <= 500 && !/[\u0000-\u001f]/.test(value); }
function providerId(value) { return typeof value === 'string' && /^prop_[0-9]+$/.test(value); }
function count(value) { return Number.isSafeInteger(value) && value >= 0; }
function validDate(value) {
  if (typeof value !== 'string') return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === (value.includes('.') ? value : value.replace('Z', '.000Z'));
}
function base() { return {contract: OBSERVED_CONTRACT, status: 'NEEDS_REVIEW', synthetic: false, valuation: null, outboundEnabled: false, authorizationRecorded: false}; }
function boundary(operation) {
  try { return operation(); }
  catch (error) { return {...base(), observationStatus: 'REJECTED', reasons: [error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'INVALID_PROJECTION']}; }
}
export function parseObservedProjection(json) {
  check(typeof json === 'string' && json.length > 0 && json.length <= MAX_JSON_LENGTH, 'INVALID_JSON_ENVELOPE');
  let parsed;
  try { parsed = JSON.parse(json); } catch { fail('INVALID_JSON'); }
  check(object(parsed), 'INVALID_PROJECTION');
  return parsed;
}
function read(raw) { const value = typeof raw === 'string' ? parseObservedProjection(raw) : raw; check(object(value), 'INVALID_PROJECTION'); return value; }
function observation(row, key) {
  if (!own(row, key)) return {presence: 'MISSING', type: 'missing', value: null};
  const value = row[key];
  if (value === null) return {presence: 'NULL', type: 'null', value: null};
  if (numericFields.has(key)) {
    check(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'MALFORMED_NUMERIC_FIELD');
    if (integerFields.has(key)) check(count(value), 'MALFORMED_INTEGER_FIELD');
  } else if (dateFields.has(key)) check(validDate(value), 'MALFORMED_DATE_FIELD');
  else if (categoryFields.has(key)) {
    check(text(value) || (Array.isArray(value) && value.length <= 100 && value.every(count) && new Set(value).size === value.length), 'MALFORMED_CATEGORY_FIELD');
  } else check(text(value), 'MALFORMED_TEXT_FIELD');
  return {presence: 'VALUE', type: Array.isArray(value) ? 'array:number' : typeof value, value: Array.isArray(value) ? [...value] : value};
}
function observations(row, fields) { return Object.fromEntries(fields.map(key => [key, observation(row, key)])); }
function required(row, keys, code) { check(object(row) && keys.every(key => own(row, key)), code); }
function credits(raw) {
  required(raw, ['used', 'properties', 'deduplicated'], 'CREDIT_EVIDENCE_MISSING');
  const result = {};
  for (const key of ['used', 'properties', 'people', 'deduplicated', 'licensed']) if (own(raw, key)) {
    check(count(raw[key]), 'MALFORMED_CREDIT_EVIDENCE'); result[key] = raw[key];
  }
  return result;
}
function provenance(input, endpoint, path) {
  const meta = object(input.evidence) ? input.evidence : input;
  check(meta.httpStatus === 200 && meta.endpoint === endpoint, 'HTTP_EVIDENCE_MISMATCH');
  const sent = meta.sentAtUtc ?? null, observed = meta.observedAtUtc ?? null;
  check((sent === null || validDate(sent) && sent.includes('T')) && (observed === null || validDate(observed) && observed.includes('T')), 'MALFORMED_OBSERVATION_TIME');
  return {provider: 'DealMachine', endpoint, responsePath: path, requestSentAt: sent, observedAt: observed, retrievedAt: null, providerSourceReference: null, providerUpdatedAt: null, expiresAt: null, independentVerificationReference: null};
}
function priceKind(row) {
  if (typeof row.sale_type === 'string' && /estimat/i.test(row.sale_type)) return 'ESTIMATED';
  if (typeof row.type === 'string' && /listing|active|pending/i.test(row.type)) return 'LISTING_OR_PENDING';
  return 'UNKNOWN'; // A provider label of "recorded" does not establish verification.
}
function addressInput(value) {
  if (typeof value === 'string') { check(text(value), 'EXPECTED_ADDRESS_REQUIRED'); return {full_address: value}; }
  check(object(value), 'EXPECTED_ADDRESS_REQUIRED');
  const fields = own(value, 'full_address') ? ['full_address'] : ['street', 'city', 'state', 'zip'];
  check(Object.keys(value).length === fields.length && fields.every(key => own(value, key) && text(value[key])), 'EXPECTED_ADDRESS_REQUIRED');
  return Object.fromEntries(fields.map(key => [key, value[key]]));
}
export function adaptCompsProjection(raw, context) {
  return boundary(() => {
    check(object(context) && providerId(context.expectedPropertyId), 'EXPECTED_PROPERTY_ID_REQUIRED');
    const input = read(raw), source = provenance(input, COMPS_ENDPOINT, '$.data[0]');
    check(object(input.evidence) && input.evidence.completeRenderedResponseParsed === true, 'COMPLETE_RESPONSE_EVIDENCE_REQUIRED');
    check(input.evidence.rawArrayPath === 'data[0].comps', 'RESPONSE_ARRAY_PATH_MISMATCH');
    check(Array.isArray(input.data) && input.data.length === 1, 'SINGLE_SUBJECT_RESPONSE_REQUIRED');
    const result = input.data[0];
    required(result, ['dm_property_id', 'found', 'subject', 'comps', 'summary', 'total_comps_found'], 'INCOMPLETE_SUBJECT_RESULT');
    check(result.dm_property_id === context.expectedPropertyId && result.found === true, 'SUBJECT_NOT_FOUND_OR_MISMATCHED');
    required(result.subject, ['dm_property_id', 'address', 'sqft', 'property_type'], 'INCOMPLETE_SUBJECT');
    check(result.subject.dm_property_id === context.expectedPropertyId, 'SUBJECT_ID_MISMATCH');
    check(text(result.subject.address), 'SUBJECT_ADDRESS_REQUIRED');
    if (context.expectedSubjectAddress !== undefined) check(result.subject.address === context.expectedSubjectAddress, 'SUBJECT_ADDRESS_MISMATCH');
    check(Array.isArray(result.comps) && result.comps.length <= 100, 'INVALID_COMPS_COLLECTION');
    check(object(result.summary) && count(result.summary.count) && count(result.total_comps_found) && result.summary.count === result.comps.length && result.total_comps_found === result.comps.length, 'COMP_COUNTS_INCOMPLETE_OR_MISMATCHED');
    const seen = new Set();
    const rows = result.comps.map((row, ordinal) => {
      required(row, ['dm_property_id', 'address', 'property_type', 'sqft', 'lot_size', 'type', 'sale_price', 'sale_date', 'sale_type', 'distance'], 'INCOMPLETE_COMP_ROW');
      check(providerId(row.dm_property_id), 'MALFORMED_COMP_ID');
      check(row.dm_property_id !== context.expectedPropertyId, 'SUBJECT_SELF_COMP');
      check(!seen.has(row.dm_property_id), 'DUPLICATE_COMP_ID'); seen.add(row.dm_property_id);
      check(text(row.address), 'COMP_ADDRESS_REQUIRED');
      const facts = observations(row, compFields), kind = priceKind(row);
      return {providerPropertyId: row.dm_property_id, providerRowOrdinal: ordinal, responsePath: `$.data[0].comps[${ordinal}]`, observations: facts, priceKind: kind, saleVerified: false, renovatedComparableVerified: false, eligibleForValuation: false, exclusionReasons: [kind === 'ESTIMATED' ? 'ESTIMATED_PRICE' : 'SALE_VERIFICATION_UNAVAILABLE', 'UNITS_AND_CURRENCY_UNVERIFIED', 'SOURCE_PROVENANCE_INCOMPLETE'], units: {sale_price: null, price_per_sqft: null, distance: null, sqft: null, lot_size: null}, source: {...source, responsePath: `$.data[0].comps[${ordinal}]`}};
    });
    return {...base(), observationStatus: 'VALIDATED_UNVERIFIED', reasons: [...reasons, 'NO_VERIFIED_SALES'], subject: {providerPropertyId: context.expectedPropertyId, observations: observations(result.subject, subjectFields), units: {sqft: null, lot_size: null, last_sale_price: null}, source}, comps: rows, completeness: {observedRowCount: rows.length, summaryCount: result.summary.count, totalCompsFound: result.total_comps_found, allReturnedRowsRepresented: true, marketCompletenessVerified: false}, counts: {estimated: rows.filter(row => row.priceKind === 'ESTIMATED').length, verified: 0, eligible: 0}, credits: credits(input.credits)};
  });
}
export function adaptAddressProjection(raw, context) {
  return boundary(() => {
    check(object(context), 'EXPECTED_ADDRESS_REQUIRED');
    const expectedInput = addressInput(context.expectedAddress);
    if (context.expectedPropertyId !== undefined) check(providerId(context.expectedPropertyId), 'INVALID_EXPECTED_PROPERTY_ID');
    const input = read(raw), source = provenance(input, ADDRESS_ENDPOINT, '$.data[0]');
    check(Array.isArray(input.data) && input.data.length === 1, 'SINGLE_ADDRESS_RESPONSE_REQUIRED');
    const row = input.data[0];
    required(row, ['input', 'matched'], 'INCOMPLETE_ADDRESS_RESULT');
    check(object(row.input) && Object.keys(row.input).length === Object.keys(expectedInput).length && Object.entries(expectedInput).every(([key, value]) => own(row.input, key) && row.input[key] === value), 'ADDRESS_INPUT_ECHO_MISMATCH');
    check(typeof row.matched === 'boolean', 'INVALID_MATCH_FLAG');
    check(object(input.totals) && input.totals.submitted === 1 && input.totals.matched === (row.matched ? 1 : 0) && input.totals.unmatched === (row.matched ? 0 : 1), 'ADDRESS_TOTALS_MISMATCH');
    check(!own(row, 'match_warning') || row.match_warning === null, 'ADDRESS_MATCH_WARNING');
    const usage = credits(input.credits);
    if (!row.matched) {
      check(object(row.match_failure), 'MATCH_FAILURE_EVIDENCE_MISSING');
      return {...base(), observationStatus: 'ADDRESS_UNMATCHED', reasons: ['ADDRESS_MATCH_FAILED'], matched: false, providerPropertyId: null, canonicalAddress: null, matchFailureCode: ['no_match', 'not_found'].includes(row.match_failure.code) ? row.match_failure.code : 'unrecognized', propertyExistence: 'UNDETERMINED', source, credits: usage};
    }
    check(providerId(row.dm_property_id) && text(row.full_address), 'MATCHED_PROPERTY_IDENTITY_MISSING');
    if (context.expectedPropertyId !== undefined) check(row.dm_property_id === context.expectedPropertyId, 'MATCHED_PROPERTY_ID_MISMATCH');
    return {...base(), observationStatus: 'ADDRESS_MATCHED_UNVERIFIED', reasons: ['PROPERTY_IDENTITY_REQUIRES_BINDING', 'CATEGORY_MEANINGS_UNVERIFIED', 'SOURCE_PROVENANCE_INCOMPLETE'], matched: true, providerPropertyId: row.dm_property_id, canonicalAddress: row.full_address, identityStatus: 'PROVIDER_REPORTED_ONLY', observations: observations(row, addressFields), source, credits: usage};
  });
}
