import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader";
import { reviewItemQuery } from "../lib/queries";

export const Route = createFileRoute("/review/$senderId")({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(reviewItemQuery(params.senderId)),
  component: SenderReview,
});

/**
 * Sender review. Match docs/designs/Detail.dc.html: confidence explainer,
 * four-option choice fieldset, and the recent-emails list.
 *
 * TODO: add GET /api/review/:id/emails (subjects + classification) for the right-hand list.
 */
function SenderReview() {
  const { senderId } = Route.useParams();
  const { data: item } = useSuspenseQuery(reviewItemQuery(senderId));

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <Link to="/review" className="font-medium no-underline">
        ← Back to review queue
      </Link>
      <PageHeader title={item.sender} eyebrow={`${item.address} · ${item.volume}`} />
      <section className="rounded-xl border border-review-border bg-review-bg p-[18px] text-review-ink">
        <h2 className="text-base font-semibold">
          {item.confidence}% sure you can{" "}
          {item.action === "unsubscribe" ? "unsubscribe" : "delete these"}
        </h2>
        <p className="mt-2">{item.reason}</p>
      </section>
    </div>
  );
}
