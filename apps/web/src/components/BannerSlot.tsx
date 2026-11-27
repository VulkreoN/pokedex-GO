/**
 * Priority queue for non-critical page banners so at most ONE banner appears above the fold at a time.
 * Priority: 1. WelcomeResume -> 2. WhatsNewBanner -> 3. PageTourBanner -> 4. InstallBanner.
 * Critical app-wide banners (UpdateBanner, AnnouncementBanner) remain separate in App.tsx.
 */
import { useMe } from '../lib/auth.js';
import { useUnseenChangelog } from '../lib/changelog.js';
import { useTourState, type TourPageId } from '../lib/tour.js';
import { InstallBanner, WelcomeResume, useCanShowInstallBanner } from './InstallBanner.js';
import { PageTourBanner } from './PageTour.js';
import { WhatsNewBanner } from './WhatsNew.js';

export function BannerSlot({
  page,
  includeWelcome = false,
  includeInstall = false,
  installDismissible = true,
}: {
  page: TourPageId;
  includeWelcome?: boolean;
  includeInstall?: boolean;
  installDismissible?: boolean;
}) {
  const me = useMe();
  const unseen = useUnseenChangelog();
  const tour = useTourState();
  const canInstall = useCanShowInstallBanner(installDismissible);

  if (includeWelcome && me.data && me.data.onboarded === false) {
    return <WelcomeResume />;
  }
  if (me.data && unseen.length > 0) {
    return <WhatsNewBanner />;
  }
  if (tour.shouldShowBanner(page)) {
    return <PageTourBanner page={page} />;
  }
  if (includeInstall && canInstall) {
    return <InstallBanner dismissible={installDismissible} />;
  }
  return null;
}
