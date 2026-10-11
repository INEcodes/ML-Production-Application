import { ArrowUpRight, Cloud, Database, Globe, Lock, Server, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, Eyebrow, IconCircle, PageHeader, SectionTitle } from "../components/ui";

const STEPS = [
  {
    icon: Upload,
    title: "You pick an input",
    body: "Your browser shrinks large images and sends them to this site's own /api endpoint.",
  },
  {
    icon: Globe,
    title: "Vercel forwards it",
    body: "A small serverless function relays the request to the model server, so the browser never needs its address.",
  },
  {
    icon: Server,
    title: "FastAPI runs the model",
    body: "A Docker container on an Oracle Cloud Always Free VM preprocesses the input and runs a TorchScript model on CPU.",
  },
  {
    icon: Database,
    title: "Versioned artifacts",
    body: "Each trained model lives in OCI Object Storage as models/<name>/v<n>/. Rolling back means pointing at an older version.",
  },
];

export function AboutPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="How it works"
        meta={<span>Trained offline · served by a separate lightweight API</span>}
      />

      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, body }, i) => {
          const last = i === STEPS.length - 1;
          return (
            <li key={title}>
              <Card as="div" tone={last ? "contrast" : "surface"} className="h-full">
                <div className="flex items-center justify-between">
                  <IconCircle inverse={last}>
                    <Icon className="size-4" aria-hidden />
                  </IconCircle>
                  <span className="text-4xl font-light tabular-nums opacity-30">0{i + 1}</span>
                </div>
                <h2 className="mt-8 text-lg font-normal tracking-tight">{title}</h2>
                <p className={`mt-2 text-sm ${last ? "text-contrast-muted" : "text-muted"}`}>{body}</p>
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <SectionTitle
            action={
              <Link to="/history" aria-label="Open history">
                <IconCircle size="sm">
                  <ArrowUpRight className="size-4" aria-hidden />
                </IconCircle>
              </Link>
            }
          >
            <span className="inline-flex items-center gap-2">
              <Lock className="size-4" aria-hidden /> Your privacy
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">
            Inputs are used for a single prediction and aren't stored on the server. Your history
            lives only in this browser, and you can clear it anytime.
          </p>
        </Card>
        <Card>
          <SectionTitle
            action={
              <Link to="/model" aria-label="Open model details">
                <IconCircle size="sm">
                  <ArrowUpRight className="size-4" aria-hidden />
                </IconCircle>
              </Link>
            }
          >
            <span className="inline-flex items-center gap-2">
              <Cloud className="size-4" aria-hidden /> Limits to know
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">
            The image model sees a tiny 32×32 version of your picture and only knows its fixed set
            of classes. The server is a single free-tier VM, so it can be briefly unavailable during
            a deploy.
          </p>
        </Card>
      </div>

      <Eyebrow>PyTorch · TorchScript · FastAPI · Docker · OCI · Vercel</Eyebrow>
    </div>
  );
}
