import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {adaptCompsProjection, adaptAddressProjection, parseObservedProjection} from './observed-provider-adapter.mjs';

const originalComps = JSON.parse(readFileSync(new URL('../comps-response-projection.json', import.meta.url), 'utf8'));
const originalAddress = JSON.parse(readFileSync(new URL('../address-response-sanitized.json', import.meta.url), 'utf8'));
const originalMatchedAddress = JSON.parse(readFileSync(new URL('../address-matched-projection.json', import.meta.url), 'utf8'));
const clone = value => structuredClone(value);
const context = {expectedPropertyId: 'prop_125714946', expectedSubjectAddress: '11311 Begonia Rock'};
const addressContext = {expectedAddress: '11311 Begonia Rock San Antonio, TX 78245'};
const structuredAddressContext = {expectedAddress: {street: '11311 Begonia Rock', city: 'San Antonio', state: 'TX', zip: '78245'}, expectedPropertyId: context.expectedPropertyId};
const comps = (input = clone(originalComps), request = context) => adaptCompsProjection(input, request);
const address = (input = clone(originalAddress), request = addressContext) => adaptAddressProjection(input, request);
function blocked(result) {
  assert.equal(result.status, 'NEEDS_REVIEW');
  assert.equal(result.synthetic, false);
  assert.equal(result.valuation, null);
  assert.equal(result.outboundEnabled, false);
  assert.equal(result.authorizationRecorded, false);
}
function rejected(result, reason) {
  blocked(result); assert.equal(result.observationStatus, 'REJECTED');
  assert.deepEqual(result.reasons, [reason]); assert.equal(result.comps, undefined);
}
// Fabricated structural example only, not evidence of a successful live address test.
function matchedFixture() {
  const input = clone(originalAddress);
  input.data = [{input: {full_address: addressContext.expectedAddress}, matched: true, dm_property_id: context.expectedPropertyId, full_address: '11311 Begonia Rock San Antonio, TX 78245', living_area_sqft: 2679, lot_size_acres: null, num_units: 0, property_type: [9001]}];
  input.totals = {submitted: 1, matched: 1, unmatched: 0};
  return input;
}

test('actual three-row projection preserves identity, ordinal, raw values and estimated classification', () => {
  const result = comps(); blocked(result);
  assert.equal(result.observationStatus, 'VALIDATED_UNVERIFIED');
  assert.deepEqual(result.comps.map(row => row.providerPropertyId), originalComps.data[0].comps.map(row => row.dm_property_id));
  assert.deepEqual(result.comps.map(row => row.providerRowOrdinal), [0, 1, 2]);
  assert.deepEqual(result.counts, {estimated: 3, verified: 0, eligible: 0});
  assert.deepEqual(result.completeness, {observedRowCount: 3, summaryCount: 3, totalCompsFound: 3, allReturnedRowsRepresented: true, marketCompletenessVerified: false});
  result.comps.forEach((row, index) => {
    assert.deepEqual(row.observations.sale_price, {presence: 'VALUE', type: 'number', value: originalComps.data[0].comps[index].sale_price});
    assert.equal(row.observations.sale_type.value, 'Estimated Sales Price');
    assert.equal(row.observations.type.value, 'sale');
    assert.equal(row.saleVerified, false); assert.equal(row.eligibleForValuation, false);
    assert.ok(Object.values(row.units).every(value => value === null));
    assert.equal(row.source.expiresAt, null); assert.equal(row.source.retrievedAt, null);
    assert.equal(row.source.responsePath, `$.data[0].comps[${index}]`);
  });
});

test('input is not mutated and JSON string boundary produces the same result', () => {
  const input = clone(originalComps), before = clone(input);
  assert.deepEqual(comps(JSON.stringify(input)), comps(input)); assert.deepEqual(input, before);
});

test('missing, null and zero remain distinct without inventing units', () => {
  const input = clone(originalComps), row = input.data[0].comps[0];
  row.lot_size = null; row.distance = 0; delete row.price_per_sqft;
  const result = comps(input); blocked(result);
  assert.deepEqual(result.comps[0].observations.lot_size, {presence: 'NULL', type: 'null', value: null});
  assert.deepEqual(result.comps[0].observations.distance, {presence: 'VALUE', type: 'number', value: 0});
  assert.deepEqual(result.comps[0].observations.price_per_sqft, {presence: 'MISSING', type: 'missing', value: null});
});

test('recorded label and input verification flags do not manufacture verified sales', () => {
  const input = clone(originalComps);
  input.data[0].comps.forEach(row => { row.sale_type = 'Recorded Sale'; row.saleVerified = true; row.currency = 'USD'; });
  input.verification = {independentlyVerifiedSales: true, currencyConfirmed: true};
  const result = comps(input); blocked(result);
  assert.equal(result.counts.verified, 0); assert.equal(result.counts.eligible, 0);
  assert.ok(result.comps.every(row => row.priceKind === 'UNKNOWN' && !row.saleVerified && row.units.sale_price === null));
});

test('active or pending values remain distinct from a verified sale', () => {
  const input = clone(originalComps);
  input.data[0].comps[0].type = 'active_listing'; input.data[0].comps[0].sale_type = 'List Price';
  const result = comps(input); assert.equal(result.comps[0].priceKind, 'LISTING_OR_PENDING'); blocked(result);
});

test('finance, contacts, images, metadata prose and valuation never propagate', () => {
  const input = clone(originalComps), marker = 'EXCLUDED-PRIVATE-CONTENT';
  input.data[0].subject.mortgage_lender = marker;
  input.data[0].comps.forEach(row => Object.assign(row, {mortgage: marker, owner: marker, contacts: [marker], images: [marker], valuation: marker}));
  input.data[0].summary.estimated_value = marker; input.evidence.omitted = marker; input.credits.private_note = marker;
  const result = comps(input); blocked(result);
  assert.ok(!JSON.stringify(result).includes(marker));
});

const invalidComps = [
  ['foreign result ID', input => { input.data[0].dm_property_id = 'prop_999'; }, 'SUBJECT_NOT_FOUND_OR_MISMATCHED'],
  ['foreign nested subject ID', input => { input.data[0].subject.dm_property_id = 'prop_999'; }, 'SUBJECT_ID_MISMATCH'],
  ['foreign subject address', input => { input.data[0].subject.address = 'Other'; }, 'SUBJECT_ADDRESS_MISMATCH'],
  ['subject not found', input => { input.data[0].found = false; }, 'SUBJECT_NOT_FOUND_OR_MISMATCHED'],
  ['multiple subjects', input => { input.data.push(clone(input.data[0])); }, 'SINGLE_SUBJECT_RESPONSE_REQUIRED'],
  ['missing row field', input => { delete input.data[0].comps[0].sale_type; }, 'INCOMPLETE_COMP_ROW'],
  ['missing subject field', input => { delete input.data[0].subject.sqft; }, 'INCOMPLETE_SUBJECT'],
  ['summary mismatch', input => { input.data[0].summary.count = 2; }, 'COMP_COUNTS_INCOMPLETE_OR_MISMATCHED'],
  ['truncated result count', input => { input.data[0].total_comps_found = 4; }, 'COMP_COUNTS_INCOMPLETE_OR_MISMATCHED'],
  ['absent total count', input => { delete input.data[0].total_comps_found; }, 'INCOMPLETE_SUBJECT_RESULT'],
  ['partial response', input => { input.evidence.completeRenderedResponseParsed = false; }, 'COMPLETE_RESPONSE_EVIDENCE_REQUIRED'],
  ['wrong array path', input => { input.evidence.rawArrayPath = 'data.comps'; }, 'RESPONSE_ARRAY_PATH_MISMATCH'],
  ['duplicate comp', input => { input.data[0].comps[1].dm_property_id = input.data[0].comps[0].dm_property_id; }, 'DUPLICATE_COMP_ID'],
  ['self comp', input => { input.data[0].comps[0].dm_property_id = context.expectedPropertyId; }, 'SUBJECT_SELF_COMP'],
  ['invalid property ID', input => { input.data[0].comps[0].dm_property_id = 42; }, 'MALFORMED_COMP_ID'],
  ['price numeric string', input => { input.data[0].comps[0].sale_price = '441000'; }, 'MALFORMED_NUMERIC_FIELD'],
  ['negative area', input => { input.data[0].comps[0].sqft = -1; }, 'MALFORMED_NUMERIC_FIELD'],
  ['infinite distance', input => { input.data[0].comps[0].distance = Infinity; }, 'MALFORMED_NUMERIC_FIELD'],
  ['fractional bedroom count', input => { input.data[0].comps[0].bedrooms = 1.2; }, 'MALFORMED_INTEGER_FIELD'],
  ['invalid calendar date', input => { input.data[0].comps[0].sale_date = '2026-02-30T00:00:00.000Z'; }, 'MALFORMED_DATE_FIELD'],
  ['object instead of category', input => { input.data[0].comps[0].property_type = {private: 'EXCLUDED'}; }, 'MALFORMED_CATEGORY_FIELD'],
  ['unexpected HTTP status', input => { input.evidence.httpStatus = 500; }, 'HTTP_EVIDENCE_MISMATCH'],
  ['wrong endpoint', input => { input.evidence.endpoint = 'POST other'; }, 'HTTP_EVIDENCE_MISMATCH'],
  ['malformed credit count', input => { input.credits.used = -1; }, 'MALFORMED_CREDIT_EVIDENCE'],
  ['too many comps', input => { input.data[0].comps = Array.from({length: 101}, () => clone(input.data[0].comps[0])); }, 'INVALID_COMPS_COLLECTION'],
];
for (const [name, mutate, reason] of invalidComps) test(`rejects ${name} without exposing partial rows`, () => {
  const input = clone(originalComps); mutate(input); rejected(comps(input), reason);
});

test('zero returned comps never produces a value', () => {
  const input = clone(originalComps); input.data[0].comps = []; input.data[0].summary.count = 0; input.data[0].total_comps_found = 0;
  const result = comps(input); blocked(result); assert.deepEqual(result.comps, []); assert.equal(result.counts.verified, 0);
});
test('expected provider identity must be supplied by the binding, not inferred', () => rejected(comps(clone(originalComps), {}), 'EXPECTED_PROPERTY_ID_REQUIRED'));

test('actual no-match response preserves zero credit observation without declaring property nonexistent', () => {
  const result = address(); blocked(result);
  assert.equal(result.observationStatus, 'ADDRESS_UNMATCHED'); assert.equal(result.matchFailureCode, 'no_match');
  assert.equal(result.propertyExistence, 'UNDETERMINED'); assert.equal(result.providerPropertyId, null);
  assert.equal(result.credits.used, 0); assert.equal(result.credits.properties, 0);
});
test('fabricated matched shape supports typed observations and exact provider ID binding', () => {
  const result = address(matchedFixture(), {...addressContext, expectedPropertyId: context.expectedPropertyId}); blocked(result);
  assert.equal(result.observationStatus, 'ADDRESS_MATCHED_UNVERIFIED'); assert.equal(result.providerPropertyId, context.expectedPropertyId);
  assert.deepEqual(result.observations.property_type, {presence: 'VALUE', type: 'array:number', value: [9001]});
  assert.equal(result.observations.lot_size_acres.presence, 'NULL'); assert.equal(result.observations.num_units.value, 0);
  assert.equal(result.observations.year_built.presence, 'MISSING');
});
test('actual structured-address match preserves observed strings, zero, null and two sale fields', () => {
  const result = address(clone(originalMatchedAddress), structuredAddressContext); blocked(result);
  assert.equal(result.observationStatus, 'ADDRESS_MATCHED_UNVERIFIED');
  assert.equal(result.providerPropertyId, 'prop_125714946');
  assert.deepEqual(result.observations.property_type, {presence: 'VALUE', type: 'string', value: 'Single Family'});
  assert.deepEqual(result.observations.last_sale_doc_type, {presence: 'VALUE', type: 'string', value: 'Vendor’s Lien'});
  assert.deepEqual(result.observations.building_condition, {presence: 'NULL', type: 'null', value: null});
  assert.deepEqual(result.observations.num_units, {presence: 'VALUE', type: 'number', value: 0});
  for (const field of ['last_sale_price', 'last_sale_amount']) assert.equal(result.observations[field].value, 384400);
  assert.equal(result.observations.last_sale_date.value, '2021-05-28');
  assert.equal(result.observations.living_area_sqft.value, 2679);
  assert.equal(result.observations.lot_size_sqft.value, 10598);
  assert.equal(result.observations.lot_size_acres.value, 0.243);
  assert.equal(result.credits.used, 0); assert.equal(result.credits.properties, 1); assert.equal(result.credits.deduplicated, 1);
});
test('endpoint sale fields remain independent when values differ or one is missing', () => {
  const input = clone(originalMatchedAddress); input.data[0].last_sale_amount = 7;
  let result = address(input, structuredAddressContext);
  assert.equal(result.observations.last_sale_amount.value, 7); assert.equal(result.observations.last_sale_price.value, 384400);
  delete input.data[0].last_sale_amount; result = address(input, structuredAddressContext);
  assert.equal(result.observations.last_sale_amount.presence, 'MISSING'); assert.equal(result.observations.last_sale_price.value, 384400);
});
test('structured-address echo must match every component and contain no extra keys', () => {
  for (const key of ['street', 'city', 'state', 'zip']) {
    const input = clone(originalMatchedAddress); input.data[0].input[key] = 'Other';
    rejected(address(input, structuredAddressContext), 'ADDRESS_INPUT_ECHO_MISMATCH');
  }
  const input = clone(originalMatchedAddress); input.data[0].input.full_address = addressContext.expectedAddress;
  rejected(address(input, structuredAddressContext), 'ADDRESS_INPUT_ECHO_MISMATCH');
});
test('mixed or incomplete expected address is refused before interpreting a match', () => {
  for (const expectedAddress of [{street: '11311 Begonia Rock'}, {...structuredAddressContext.expectedAddress, full_address: addressContext.expectedAddress}]) {
    rejected(address(clone(originalMatchedAddress), {expectedAddress}), 'EXPECTED_ADDRESS_REQUIRED');
  }
});
test('observed three requests expose charged credits separately from property counts', () => {
  const results = [address(), comps(), address(clone(originalMatchedAddress), structuredAddressContext)];
  assert.deepEqual(results.map(result => result.credits.used), [0, 1, 0]);
  assert.equal(results.reduce((sum, result) => sum + result.credits.used, 0), 1);
  assert.equal(results[2].credits.properties, 1); assert.equal(results[2].credits.used, 0);
});
test('matched address unknown fields are excluded', () => {
  const input = matchedFixture(), marker = 'EXCLUDED-PRIVATE-CONTENT';
  Object.assign(input.data[0], {contacts: marker, mortgage: marker, images: marker, note: marker});
  assert.ok(!JSON.stringify(address(input)).includes(marker));
});
test('actual matched address excludes injected estimates, listing prices, lender fields and unobserved commercial units', () => {
  const input = clone(originalMatchedAddress), marker = 'EXCLUDED-PRIVATE-CONTENT';
  const excluded = ['estimated_value', 'mls_current_listing_price', 'mortgage', 'mortgage_lender', 'lender', 'num_commercial_units'];
  for (const key of excluded) input.data[0][key] = marker;
  const result = address(input, structuredAddressContext); blocked(result);
  assert.equal(result.observationStatus, 'ADDRESS_MATCHED_UNVERIFIED');
  assert.ok(!JSON.stringify(result).includes(marker));
  for (const key of excluded) assert.ok(!Object.hasOwn(result.observations, key));
});
test('unmatched pre-send timestamp is request time, never observation or retrieval time', () => {
  const result = address();
  assert.equal(originalAddress.sentAtUtc, '2026-10-07T22:26:36Z');
  assert.equal(result.source.requestSentAt, originalAddress.sentAtUtc);
  assert.equal(result.source.observedAt, null); assert.equal(result.source.retrievedAt, null);
});
test('provider failure prose is never copied', () => {
  const input = clone(originalAddress); input.data[0].match_failure.reason = 'EXCLUDED-PRIVATE-CONTENT';
  input.data[0].match_failure.code = 'EXCLUDED-PRIVATE-CONTENT';
  const result = address(input); assert.equal(result.matchFailureCode, 'unrecognized'); assert.ok(!JSON.stringify(result).includes('EXCLUDED-PRIVATE-CONTENT'));
});
for (const [name, mutate, reason] of [
  ['wrong echo', input => { input.data[0].input.full_address = 'Other'; }, 'ADDRESS_INPUT_ECHO_MISMATCH'],
  ['inconsistent totals', input => { input.totals.matched = 1; }, 'ADDRESS_TOTALS_MISMATCH'],
  ['string match flag', input => { input.data[0].matched = 'false'; }, 'INVALID_MATCH_FLAG'],
  ['match warning', input => { input.data[0].match_warning = {code: 'rewritten'}; }, 'ADDRESS_MATCH_WARNING'],
]) test(`address rejects ${name}`, () => { const input = clone(originalAddress); mutate(input); rejected(address(input), reason); });
test('matched address refuses a foreign provider ID', () => rejected(address(matchedFixture(), {...addressContext, expectedPropertyId: 'prop_999'}), 'MATCHED_PROPERTY_ID_MISMATCH'));
test('malformed matched numeric field is not coerced', () => { const input = matchedFixture(); input.data[0].living_area_sqft = '2679'; rejected(address(input), 'MALFORMED_NUMERIC_FIELD'); });
test('bounded JSON parser rejects invalid/double encoded/object/oversized envelopes', () => {
  for (const raw of ['', '{', JSON.stringify(JSON.stringify(originalComps)), ' '.repeat(250001), originalComps]) assert.throws(() => parseObservedProjection(raw));
  rejected(comps('{'), 'INVALID_JSON'); rejected(comps(JSON.stringify(JSON.stringify(originalComps))), 'INVALID_PROJECTION');
});
