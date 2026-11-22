import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';
import { CmsProvider } from './cms/CmsProvider';
import { isApiError } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry network blips, never business errors (404, 403…), which will not change on retry.
      retry: (count, err) => (isApiError(err) ? ['NETWORK', 'INTERNAL'].includes(err.code) && count < 2 : count < 2),
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'offlineFirst' },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CmsProvider>
        <App />
      </CmsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
