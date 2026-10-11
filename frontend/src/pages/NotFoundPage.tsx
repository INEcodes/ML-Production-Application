import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, EmptyState } from "../components/ui";

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={<Compass className="size-7" aria-hidden />}
        title="Page not found"
        action={
          <Link
            to="/"
            className="inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Back to Classify
          </Link>
        }
      >
        That link doesn't lead anywhere. Use the menu to get back on track.
      </EmptyState>
    </Card>
  );
}
