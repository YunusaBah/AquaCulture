export type AiProviderName = 'local-ollama' | 'mock';

export type AiSuggestionRequest = {
  note: string;
  context?: string;
};

export type AiSuggestionResult = {
  suggestion: string;
  provider: AiProviderName;
};

const FALLBACK_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

function fallbackSuggestion(note: string, context?: string): string {
  const trimmed = note.trim();
  if (!trimmed) {
    return 'Record an observation to generate a professional draft.';
  }

  const lower = trimmed.toLowerCase();
  const hasMortality = lower.includes('dead') || lower.includes('mortality') || lower.includes('die');
  const hasWaterIssue = lower.includes('green') || lower.includes('cloudy') || lower.includes('muddy') || lower.includes('water');
  const hasLowActivity = lower.includes('less active') || lower.includes('inactive') || lower.includes('slow') || lower.includes('weak');
  const hasOxygen = lower.includes('oxygen') || lower.includes('dissolved') || lower.includes('gasping') || lower.includes('stress');
  const hasFeedIssue = lower.includes('feed') || lower.includes('appetite') || lower.includes('eat') || lower.includes('ration');
  const hasDisease = lower.includes('lesion') || lower.includes('spot') || lower.includes('fungus') || lower.includes('tail');
  const hasAlgae = lower.includes('algae') || lower.includes('green water') || lower.includes('bloom');

  const base = `Suggested Observation\n\n${trimmed}`;
  const contextLine = context ? `Context: ${context}` : '';

  let action = 'Compare the latest pond readings with the previous 24 hours before the next feed. Keep monitoring closely and capture any change in appetite or movement.';
  if (hasMortality) action = 'Check dissolved oxygen, ammonia, and recent feed intake immediately. Inspect the pond for crowding, stress, or poor circulation before the next feeding cycle.';
  if (hasWaterIssue && !hasMortality) action = 'Review water clarity, oxygen, and ammonia first. Reduce feed load and plan a direct water-quality check before resuming the normal schedule.';
  if (hasLowActivity) action = 'The fish are showing stress. Reduce feed temporarily, verify oxygen saturation, and compare recent behavior with nearby ponds before increasing intake again.';
  if (hasOxygen) action = 'Oxygen risk is likely. Measure early-morning dissolved oxygen, confirm aeration performance, and delay heavy feeding until the reading stabilizes.';
  if (hasFeedIssue && !hasLowActivity) action = 'Feed response is inconsistent. Check feed quality, compare appetite with adjacent ponds, and slightly reduce the next ration until behavior normalizes.';
  if (hasDisease) action = 'Visible health signs require targeted follow-up. Separate affected fish if needed and escalate for veterinary review if the condition spreads.';
  if (hasAlgae) action = 'The water pattern suggests algae pressure. Reduce feed, inspect circulation, and verify oxygen levels before continuing a normal feeding plan.';

  return [base, contextLine, action, 'Manager approval is required before treatment or major operational changes.'].filter(Boolean).join('\n\n');
}

async function requestLocalOllama(note: string, context?: string): Promise<string | null> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: FALLBACK_MODEL,
        prompt: `You are AquaSphere AI. Write a concise farm-safe observation summary for aquaculture operations.\n\nUser note:\n${note}\n\nAdditional context:\n${context || 'No additional context.'}\n\nReturn only a short professional recommendation that can be reviewed by a farm manager.`,
        stream: false,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { response?: string };
    const suggestion = payload.response?.trim();
    return suggestion && suggestion.length > 0 ? suggestion : null;
  } catch {
    return null;
  }
}

export async function generateAiSuggestion(input: AiSuggestionRequest): Promise<AiSuggestionResult> {
  const note = (input.note || '').trim();

  if (!note) {
    return { suggestion: 'Record an observation to generate a professional draft.', provider: 'mock' };
  }

  const provider = ((process.env.AI_PROVIDER || 'local-ollama') as string).toLowerCase();
  const normalizedProvider = provider === 'mock' ? 'mock' : 'local-ollama';

  if (normalizedProvider === 'local-ollama') {
    const remoteSuggestion = await requestLocalOllama(note, input.context);
    if (remoteSuggestion) {
      return { suggestion: remoteSuggestion, provider: 'local-ollama' };
    }
  }

  return {
    suggestion: fallbackSuggestion(note, input.context),
    provider: 'mock',
  };
}
