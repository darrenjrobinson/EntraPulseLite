// Conversation Context Manager for EntraPulse Lite
// Maintains conversation history and context for follow-up questions

export interface ConversationTurn {
  id: string;
  timestamp: Date;
  userMessage: string;
  assistantMessage: string;
  mcpResults?: {
    fetchResult?: any;
    lokkaResult?: any;
    microsoftDocsResult?: any;
  };
  analysis?: any;
}

export interface ConversationContext {
  sessionId: string;
  userId?: string;
  turns: ConversationTurn[];
  summary?: string;
  lastUpdated: Date;
  maxTurns: number;
  maxContextLength: number;
}

export class ConversationContextManager {
  private contexts: Map<string, ConversationContext> = new Map();
  private readonly defaultMaxTurns = 10;
  private readonly defaultMaxContextLength = 8000;

  /**
   * Get or create conversation context for a session
   */
  getContext(sessionId: string, userId?: string): ConversationContext {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        sessionId,
        userId,
        turns: [],
        lastUpdated: new Date(),
        maxTurns: this.defaultMaxTurns,
        maxContextLength: this.defaultMaxContextLength
      });
    }
    return this.contexts.get(sessionId)!;
  }

  /**
   * Add a new conversation turn
   */
  addTurn(
    sessionId: string, 
    userMessage: string, 
    assistantMessage: string,
    mcpResults?: any,
    analysis?: any
  ): void {
    const context = this.getContext(sessionId);
    
    const turn: ConversationTurn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      userMessage,
      assistantMessage,
      mcpResults,
      analysis
    };

    context.turns.push(turn);
    context.lastUpdated = new Date();

    // Trim old turns if needed
    if (context.turns.length > context.maxTurns) {
      context.turns = context.turns.slice(-context.maxTurns);
    }

    console.log(`💬 Added conversation turn. Session: ${sessionId}, Turns: ${context.turns.length}`);
  }

  /**
   * Get conversation history as formatted context for LLM
   */
  getFormattedContext(sessionId: string, currentQuery: string): string {
    const context = this.getContext(sessionId);
    
    if (context.turns.length === 0) {
      return `Current Query: ${currentQuery}`;
    }

    let formattedContext = "## Conversation History\n\n";
    
    // Add recent turns (last 5 for context)
    const recentTurns = context.turns.slice(-5);
    
    recentTurns.forEach((turn, index) => {
      formattedContext += `### Turn ${recentTurns.length - index} (${turn.timestamp.toLocaleTimeString()})\n`;
      formattedContext += `**User:** ${turn.userMessage}\n`;
      formattedContext += `**Assistant:** ${turn.assistantMessage.substring(0, 300)}${turn.assistantMessage.length > 300 ? '...' : ''}\n\n`;
    });

    formattedContext += `### Current Query\n${currentQuery}\n\n`;
    formattedContext += "**Note:** Please consider the conversation history when responding to provide contextual and relevant answers.";

    return formattedContext;
  }

  /**
   * Get related context from previous turns
   */
  getRelatedContext(sessionId: string, currentQuery: string): string[] {
    const context = this.getContext(sessionId);
    const relatedContext: string[] = [];

    // Simple keyword matching for related context
    const queryKeywords = currentQuery.toLowerCase().split(' ').filter(word => word.length > 3);
    
    context.turns.forEach(turn => {
      const turnText = `${turn.userMessage} ${turn.assistantMessage}`.toLowerCase();
      const hasRelatedKeywords = queryKeywords.some(keyword => turnText.includes(keyword));
      
      if (hasRelatedKeywords) {
        relatedContext.push(`Previous Q: ${turn.userMessage}\nPrevious A: ${turn.assistantMessage.substring(0, 200)}...`);
      }
    });

    return relatedContext.slice(-3); // Return max 3 related contexts
  }

  /**
   * Generate conversation summary (for long conversations)
   */
  generateSummary(sessionId: string): string {
    const context = this.getContext(sessionId);
    
    if (context.turns.length < 3) {
      return "New conversation";
    }

    const topics = new Set<string>();
    const queries = context.turns.map(turn => turn.userMessage);
    
    // Simple topic extraction (can be enhanced with NLP)
    queries.forEach(query => {
      const words = query.toLowerCase().split(' ');
      words.forEach(word => {
        if (word.length > 4 && !['what', 'how', 'when', 'where', 'which', 'that', 'this'].includes(word)) {
          topics.add(word);
        }
      });
    });

    return `Conversation covering: ${Array.from(topics).slice(0, 5).join(', ')}. ${context.turns.length} exchanges.`;
  }

  /**
   * Clear a single session's context
   */
  clearSession(sessionId: string): void {
    if (this.contexts.delete(sessionId)) {
      console.log(`🧹 Cleared conversation context for session: ${sessionId}`);
    }
  }

  /**
   * Clear all conversation contexts. Used on sign-out / tenant profile switch
   * so a new tenant's session can never see the previous user's history.
   */
  clearAll(): void {
    const count = this.contexts.size;
    this.contexts.clear();
    console.log(`🧹 Cleared all conversation contexts (${count} session(s))`);
  }

  /**
   * Clear old conversations (cleanup)
   */
  cleanup(maxAgeHours: number = 24): void {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    for (const [sessionId, context] of this.contexts) {
      if (context.lastUpdated < cutoff) {
        this.contexts.delete(sessionId);
        console.log(`🧹 Cleaned up old conversation context: ${sessionId}`);
      }
    }
  }

  /**
   * Get conversation statistics
   */
  getStats(): { activeContexts: number; totalTurns: number; avgTurnsPerContext: number } {
    const activeContexts = this.contexts.size;
    const totalTurns = Array.from(this.contexts.values()).reduce((sum, ctx) => sum + ctx.turns.length, 0);
    const avgTurnsPerContext = activeContexts > 0 ? totalTurns / activeContexts : 0;

    return { activeContexts, totalTurns, avgTurnsPerContext };
  }
}

// Singleton instance
export const conversationContextManager = new ConversationContextManager();
