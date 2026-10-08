/** Observed sanitized example. It has no native bindings, unit confirmations, tenant policy or valuation. */
import address from '../../../native-deliverables/observed-source/address-matched-projection.json';
import comps from '../../../native-deliverables/observed-source/comps-response-projection.json';
export function observedReviewExample(){return {operation:'review' as const,pair:{expectedPropertyId:'prop_125714946',expectedSubjectAddress:'11311 Begonia Rock',expectedAddress:{street:'11311 Begonia Rock',city:'San Antonio',state:'TX',zip:'78245'},addressProjection:structuredClone(address),compsProjection:structuredClone(comps),pricingSelection:{basis:'provider_estimated_comps' as const,acceptanceReference:'owner-2026-10-07T22:46:11Z-estimates-accepted'}}};}
