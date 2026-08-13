import { Ic } from "@/components/icons";
import { withBase } from "@/lib/base";
import type { ClientBanner } from "@/lib/banners";

/**
 * The announcement strip itself — just markup, no state.
 *
 * Both the real banner (components/UpdateBanner) and the live preview in the
 * management form render this, so what an admin sees while writing is the same
 * component students get, and the two can't drift apart.
 */

export type BannerShape = Pick<
  ClientBanner,
  "message" | "ctaLabel" | "ctaHref" | "tone" | "icon" | "dismissDays"
>;

export default function BannerBody({
  banner,
  onDismiss,
  preview = false,
}: {
  banner: BannerShape;
  onDismiss?: () => void;
  /** Preview mode: the × is inert and skipped by keyboard and screen readers. */
  preview?: boolean;
}) {
  // The arrow is drawn here rather than typed into the label, so every banner
  // gets the same affordance and nobody has to find a → on their keyboard.
  const label = (
    <>
      {banner.message}
      {banner.ctaLabel ? (
        <>
          {" "}
          <span className="nb-cta">{banner.ctaLabel} &rarr;</span>
        </>
      ) : null}
    </>
  );

  return (
    <div className={`newsbanner tone-${banner.tone}`}>
      <div className="nb-inner">
        <span className="nb-spark">
          <Ic name={banner.icon} size={19} />
        </span>
        {banner.ctaHref ? (
          <a href={preview ? undefined : withBase(banner.ctaHref)} tabIndex={preview ? -1 : undefined}>
            {label}
          </a>
        ) : (
          <span className="nb-text">{label}</span>
        )}
        {banner.dismissDays > 0 && (
          <button
            type="button"
            className="nb-close"
            onClick={preview ? undefined : onDismiss}
            aria-label="Hide this message"
            aria-hidden={preview || undefined}
            tabIndex={preview ? -1 : undefined}
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
