import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Layout } from '@/components/Layout';
import { ToastProvider } from '@/components/Toast';

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  return (
    <ToastProvider>
      <Layout>
        <Outlet />
      </Layout>
    </ToastProvider>
  );
}
