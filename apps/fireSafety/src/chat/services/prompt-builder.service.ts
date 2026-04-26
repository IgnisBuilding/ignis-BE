import { Injectable } from '@nestjs/common';
import { ChatRequestDto } from '../dto/chat.dto';
import { BuiltContext, ChatMode } from '../chat.types';

@Injectable()
export class PromptBuilderService {
  build(input: ChatRequestDto, context: BuiltContext, mode: ChatMode): string {
    const safetyInstructions =
      mode === 'emergency'
        ? 'Emergency mode is active. Prioritize immediate life safety guidance and short actionable instructions.'
        : 'Normal mode is active. Provide concise, practical fire-safety guidance.';

    return [
      'You are Ignis fire-safety assistant.',
      safetyInstructions,
      context.summary,
      'The user drives all actions. Do not propose autonomous background operations.',
      `User message: ${input.message}`,
    ].join('\n');
  }
}
