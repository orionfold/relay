import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { customers, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageShell } from "@/components/shared/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/shared/status-chip";
import { getCostByCustomer } from "@/lib/usage/ledger";
import { CustomerDetailActions } from "@/components/customers/customer-detail-actions";
import { FolderKanban } from "lucide-react";
import { CustomerBoundaryNotice } from "@/components/shared/relay-boundary-notice";

export const dynamic = "force-dynamic";

function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .get();
  if (!customer) notFound();

  const linkedProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
    })
    .from(projects)
    .where(eq(projects.customerId, id))
    .orderBy(projects.name);

  const costRollup = await getCostByCustomer(30);
  const cost = costRollup.find((c) => c.customerId === id);

  return (
    <PageShell
      title={customer.name}
      description={customer.industry ? `${customer.industry} · ${customer.slug}` : customer.slug}
      backHref="/customers"
      backLabel="Customers"
      actions={
        <CustomerDetailActions
          customer={{
            id: customer.id,
            name: customer.name,
            slug: customer.slug,
            industry: customer.industry,
            notes: customer.notes,
            status: customer.status,
          }}
        />
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusChip status={customer.status} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Linked projects</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold tabular-nums">
              {linkedProjects.length}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">AI spend (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-semibold tabular-nums">
              {formatUsd(cost?.costMicros ?? 0)}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">
              {cost?.runs ?? 0} runs · {(cost?.totalTokens ?? 0).toLocaleString()} tokens
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <CustomerBoundaryNotice />
      </div>

      {customer.notes && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Notes</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{customer.notes}</CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {linkedProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects linked yet. Set a project&apos;s customer to attribute its work here.
            </p>
          ) : (
            <ul className="divide-y">
              {linkedProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between gap-2 py-2.5 hover:text-primary"
                  >
                    <span className="flex items-center gap-2">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      {project.name}
                    </span>
                    <StatusChip status={project.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
