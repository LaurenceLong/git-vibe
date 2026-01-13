import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Layout } from '@/components/Layout';

export const Route = createRootRoute({
  component: Root,
});

function Root() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}