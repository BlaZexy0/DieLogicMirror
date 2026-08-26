/* Auflöser für die Viewer-Tests scharfschalten (siehe resolver.mjs). */
import { register } from 'node:module';
register(new URL('./resolver.mjs', import.meta.url));
