// Shape of POST /api/comps responses, shared by the API route and the UI.

import type { ArvOutcome } from "./arv";

export interface SubjectSummary {
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  lotSizeAcres: number | null;
}

export interface CompsApiResponse {
  subject: SubjectSummary;
  outcome: ArvOutcome;
  /** DealMachine's model estimate — reference only, never our ARV. */
  dmReferenceEstimate: number | null;
  totalSoldCompsFetched: number;
}
