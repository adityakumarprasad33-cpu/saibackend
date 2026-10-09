/**
 * Centralized Versioned Prompt Registry
 */

export interface PromptTemplate {
  key: string;
  version: string;
  template: string;
}

export class PromptRegistry {
  private static readonly prompts: Map<string, PromptTemplate> = new Map([
    [
      'CLASSIFY_GRIEVANCE',
      {
        key: 'CLASSIFY_GRIEVANCE',
        version: 'v1.2',
        template: 'Classify the citizen grievance below. Return only a JSON object with string fields category, assignedAgent, agentTitle, department, priority and a positive integer slaHours. Do not invent details that are not present. Title: {title}. Description: {description}. District: {district}. State code: {stateCode}.',
      },
    ],
    [
      'DRAFT_OFFICIAL_RESPONSE',
      {
        key: 'DRAFT_OFFICIAL_RESPONSE',
        version: 'v1.0',
        template: 'Draft an official response for grievance {publicId} from these verified details: {description}. Return only JSON with a concise string summary and an actionSteps array. Do not claim actions have happened; phrase them as recommendations.',
      },
    ],
    [
      'DUPLICATE_CHECK',
      {
        key: 'DUPLICATE_CHECK',
        version: 'v1.1',
        template: 'Compare the two citizen reports. Return only JSON with boolean isDuplicate, numeric similarityScore from 0 to 1, and a short reasoning. Target: {targetText}. Candidate: {candidateText}.',
      },
    ],
  ]);

  public static getPrompt(key: string, variables: Record<string, string>): string {
    const prompt = this.prompts.get(key);
    if (!prompt) {
      throw new Error(`PromptRegistryError: Prompt with key '${key}' not registered.`);
    }

    let rendered = prompt.template;
    for (const [vKey, vVal] of Object.entries(variables)) {
      rendered = rendered.replace(`{${vKey}}`, vVal);
    }
    return rendered;
  }
}
