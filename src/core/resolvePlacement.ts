import { classify, type NormalizedDicts } from './classify';

export function resolvePlacement(token: string, dicts: NormalizedDicts, partialMatch: boolean) {
  return classify(token, dicts, partialMatch);
}
