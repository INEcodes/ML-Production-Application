import { Cloud, Database, Globe, Lock, Server, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, SectionTitle } from "../components/ui";

const STEPS = [
  {
    icon: Upload,
    title: "You pick an input",
    body: "Your browser shrinks large images and sends them to this site's own /api endpoint.",
  },
  {
    icon: Globe,
    title: "Vercel forwards it",
    body: "A small serverless function on Vercel relays the request to the model server, so its address never needs to be exposed to the browser.",
  },
  {
    icon: Server,
    title: "FastAPI runs the model",
    body: "A Docker container on an Oracle Cloud Always Free VM preprocesses the input and runs a TorchScript model on CPU.",
  },
  {
    icon: Database,
    title: "Versioned model artifacts",
    body: "Each trained model is stored in OCI Object Storage as models/<name>/v<n>/. Rolling back means pointing the server at an older version.",
  },
];

export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          A PyTorch model trained offline and served by a separate lightweight API.
        </p>
      </header>

      <Card>
        <SectionTitle>From your click to a prediction</SectionTitle>
        <ol className="relative space-y-6 border-l-2 border-indigo-100 pl-8 dark:border-indigo-950">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative">
              <span className="absolute -left-[3.05rem] grid size-9 place-items-center rounded-full bg-indigo-600 text-white ring-4 ring-white dark:ring-slate-900">
                <Icon className="size-4" aria-hidden />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                Step {i + 1}
              </p>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{body}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Lock className="size-4" aria-hidden /> Your privacy
            </span>
          </SectionTitle>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Inputs are used for a single prediction and aren't stored on the server. Your History
            lives only in this browser. Clear it anytime from the{" "}
            <Link to="/history" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              History
            </Link>{" "}
            page.
          </p>
        </Card>
        <Card>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <Cloud className="size-4" aria-hidden /> Limits to know
            </span>
          </SectionTitle>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            The image model sees a tiny 32×32 version of your picture and only knows its fixed set
            of classes (see{" "}
            <Link to="/model" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              Model
            </Link>
            ). The server is a single free-tier VM, so it can be briefly unavailable during a deploy.
          </p>
        </Card>
      </div>
    </div>
  );
}
