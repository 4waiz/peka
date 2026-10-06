import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/global.css';
import './styles/panels.css';
import './styles/twin.css';
import App from './App';
import { useAppStore } from './store/useAppStore';

if (import.meta.env.DEV) (window as unknown as { __store: typeof useAppStore }).__store = useAppStore;

createRoot(document.getElementById('root')!).render(<App />);
