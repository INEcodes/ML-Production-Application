import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={<Compass className="size-6" aria-hidden />}
        title="Page not found"
        action={
          <Link
            to="/"
            className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-on-primary hover:opacity-85"
          >
            Back to Classify
          </Link>
        }
      >
        That link doesn't lead anywhere. Use the menu above to get back on track.
      </EmptyState>
    </Card>
  );
}
