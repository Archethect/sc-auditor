/**
 * A single item from the Cyfrin audit checklist.
 */
export interface ChecklistItem {
  /** e.g., "SOL-CR-1" */
  id: string;
  /** Category assigned during checklist flattening (future). Callers must populate this field. Not present in raw Cyfrin JSON. */
  category: string;
  /** The checklist question or check description */
  question: string;
  /** Detailed description of the checklist item */
  description: string;
  /** Recommended remediation steps */
  remediation: string;
  /** External reference URLs */
  references: string[];
  /** Classification tags */
  tags: string[];
}
