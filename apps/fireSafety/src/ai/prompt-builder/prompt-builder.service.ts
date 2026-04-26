import { Injectable } from '@nestjs/common';

type Language = 'en' | 'ur';
type ScopeLevel = 'global' | 'society' | 'building';

export interface PromptBuilderInput {
  systemContext: string;
  userMessage: string;
  language: Language;
  userRole: string;
  scopeLevel: ScopeLevel;
}

export interface PromptBuilderOutput {
  systemPrompt: string;
  userPrompt: string;
}

@Injectable()
export class PromptBuilderService {
  build(input: PromptBuilderInput): PromptBuilderOutput {
    const language = input.language || 'en';
    const role = (input.userRole || 'unknown').toLowerCase();
    const scopeTone = this.getScopeTone(input.scopeLevel, language);
    const languageInstruction = this.getLanguageInstruction(language);

    const immutableInstructions = [
      'Only respond to the user query. No proactive recommendations beyond asked scope.',
      'Do not suggest triggering alarms, doors, notifications, or any automated actions.',
      'Use only provided context. If information is unknown, clearly say it is unknown.',
      `Respect scope level tone: ${scopeTone}`,
      languageInstruction,
      'Keep emergency responses short and command-clear.',
    ].join('\n');

    const systemPrompt = [
      'You are the Ignis fire-safety assistant.',
      `User role: ${role}.`,
      immutableInstructions,
      'Provided context follows:',
      input.systemContext || 'No context available.',
    ].join('\n');

    const userPrompt = input.userMessage?.trim() || '';

    return {
      systemPrompt,
      userPrompt,
    };
  }

  private getScopeTone(scopeLevel: ScopeLevel, language: Language): string {
    if (language === 'ur') {
      if (scopeLevel === 'building') {
        return 'building => مقامی رہنمائی اور مخصوص مقام کی ہدایات';
      }
      if (scopeLevel === 'society') {
        return 'society => سوسائٹی کی مجموعی آپریشنل صورتحال';
      }
      return 'global => مانیٹرنگ اور خلاصہ جاتی انداز';
    }

    if (scopeLevel === 'building') {
      return 'building => localized guidance tone';
    }
    if (scopeLevel === 'society') {
      return 'society => operational rollup tone';
    }
    return 'global => summary and monitoring tone';
  }

  private getLanguageInstruction(language: Language): string {
    return language === 'ur'
      ? 'Respond strictly in Urdu.'
      : 'Respond strictly in English.';
  }
}
