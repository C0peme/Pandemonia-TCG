import type { ReactNode } from 'react';

/** Node kinds that render as a panel rather than a fight. */
export type SceneKind = 'rest' | 'store' | 'enhance' | 'event' | 'trial';

/**
 * The banner every non-combat node panel wears.
 *
 * Store, Rest, Enhance and Event used to render as `.advpanel` — the same bordered
 * rectangle with an `<h2>` — so an Enhancement altar and a campfire were pixel-identical
 * apart from their heading, and neither carried its map colour into the screen you
 * arrived at. `--nd` is set once by the `advscene--{kind}` class and inherited by the
 * banner, the border, the tabs and the buy buttons inside.
 */
export function Scene({ kind, icon, title, flavour, children }: {
  kind: SceneKind;
  icon: string;
  title: string;
  flavour?: string;
  children: ReactNode;
}) {
  return (
    <div className={`advpanel advscene advscene--${kind}`}>
      <div className="advscene__banner">
        <span className="advscene__icon" aria-hidden="true">{icon}</span>
        <span className="advscene__head">
          <h2 className="advscene__title">{title}</h2>
          {flavour && <span className="advscene__flavour">{flavour}</span>}
        </span>
      </div>
      <div className="advscene__body">{children}</div>
    </div>
  );
}
