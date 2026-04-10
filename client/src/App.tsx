import AppRoutes from './routes/AppRoutes';
import { AppStateProvider } from './context/AppStateContext';

export default function App({ googleOAuthEnabled = true }: { googleOAuthEnabled?: boolean }) {
  return (
    <AppStateProvider googleOAuthEnabled={googleOAuthEnabled}>
      <AppRoutes />
    </AppStateProvider>
  );
}
