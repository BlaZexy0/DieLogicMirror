/* Web-Worker der Sichtbarkeit: rechnet eine der sechs Richtungen und
   schickt dot/frac zurück (siehe computeVisibility in visibility.js). */
import { computeOneDirection } from './visibility.js';

self.onmessage = e => {
  const { model, dir, samples } = e.data;
  const { dot, frac } = computeOneDirection(model, dir, samples);
  self.postMessage({ dir, dot, frac }, [dot.buffer, frac.buffer]);
};
