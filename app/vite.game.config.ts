import { mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(base, { base: './', build: { rollupOptions: { input: { preview: 'index.html', game: 'play.html' } } } });
