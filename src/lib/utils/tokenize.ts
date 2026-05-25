export interface Token { text: string; clickable: boolean; }

export function tokenizeForClicking(input: string): Token[] {
  const re = /([A-Za-z][A-Za-z0-9_-]*)|([\u4e00-\u9fff]+)|(\s+)|([^\sA-Za-z0-9\u4e00-\u9fff]+)/g;
  const tokens: Token[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    const text = m[0];
    const clickable = !!(m[1] || m[2]);
    tokens.push({ text, clickable });
  }
  return tokens;
}
