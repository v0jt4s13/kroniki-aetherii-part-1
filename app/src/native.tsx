import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NativeGameShell } from './GameShell';
import Prototype from './Prototype';
import './native.css';

createRoot(document.getElementById('root')!).render(<StrictMode><NativeGameShell><Prototype/></NativeGameShell></StrictMode>);
