import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { PRDetail } from '@/components/pr/PRDetail';

export const Route = createFileRoute('/changesets/$id')({
  component: PRDetailPage,
});

/**
 * PR Detail page component
 * Transforms the changeset detail route to a PR detail page
 */
function PRDetailPage() {
  const { id } = Route.useParams();

  // Use the PRDetail component with the changeset ID
  return <PRDetail prId={id} />;
}
