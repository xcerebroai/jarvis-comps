/** Practical review actions, never fictitious completed handoffs or values. */
export function reviewGuidance(missing:string[]){
 const items=missing.map(reason=>({reason,nextAction:/policy|settings/i.test(reason)?'Have an authorized client reviewer configure the missing approved assumptions.':/identity|subject|property|parcel/i.test(reason)?'Confirm the exact property or parcel and attach the authoritative source.':/income|rent|NOI|cap|unit/i.test(reason)?'Attach the unit-matched rent roll, operating statement and sourced capitalization rate.':/comp|sale|condition|evidence/i.test(reason)?'Have a reviewer verify current market-sale facts, asset comparability and condition evidence.':/Idempotency/i.test(reason)?'Use the original unchanged request or create a new request ID for changed inputs.':'Resolve the stated missing evidence with an authorized reviewer before proceeding.'}));
 return {reviewItems:items,offerApproved:false,outboundEnabled:false,humanNotified:false};
}
