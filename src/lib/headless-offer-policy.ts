import {createHash} from 'node:crypto';
import type {Packet} from './acquisition-packet-validation';
export * from './acquisition-packet-validation';
export function packetDigest(p:Packet){return createHash('sha256').update(JSON.stringify({propertyId:p.propertyId,recipientId:p.recipientId,asset:p.asset,strategy:p.strategy,priceUsd:p.priceUsd,terms:{closingDate:p.terms.closingDate,depositUsd:p.terms.depositUsd,inspectionDays:p.terms.inspectionDays,assignmentAllowed:p.terms.assignmentAllowed,financing:p.terms.financing,sellerConcessionsUsd:p.terms.sellerConcessionsUsd},analysisId:p.analysisId,analysisVersion:p.analysisVersion})).digest('hex');}
