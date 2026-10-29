import { type ReactNode, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Home() {
  const ref = useRef<HTMLIFrameElement>(null);
  const buildId =
    document.querySelector('meta[name="study-desk-build"]')?.getAttribute('content') ?? '';
  return (
    <iframe
      ref={ref}
      title="New Tab workspace"
      data-testid="frame-workspace"
      src={`${import.meta.env.BASE_URL}workspace.html?build=${encodeURIComponent(buildId)}`}
      className="fixed inset-0 h-[100dvh] w-full border-0"
      style={{ background: 'transparent' }}
      allow="fullscreen; clipboard-write"
      allowFullScreen
      onLoad={() => ref.current?.contentWindow?.focus()}
    />
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
