/**
 * Estimated tokens of streamed output, before pi reports a response's exact
 * `usage`: CJK characters cost about one token each (GLM, DeepSeek, GPT-o200k),
 * the rest about four characters a token.
 */
const CJK_PATTERN = /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{2fa1f}\uac00-\ud7af]/u;

export function estimateTokens(text: string): number {
  let cjk = 0;
  let rest = 0;
  for (const ch of text) {
    if (CJK_PATTERN.test(ch)) cjk++;
    else rest++;
  }
  return cjk + rest / 4;
}
