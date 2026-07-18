import { AnimatePresence, type Transition } from 'motion/react';
import * as m from 'motion/react-m';
import { useLocation, useOutlet } from 'react-router-dom';
import { pageVariants } from '../lib/motion';

const pageTransition: Transition = { duration: 0.18, ease: 'easeOut' };

/**
 * Drop-in replacement for react-router-dom's <Outlet /> that animates page
 * transitions using motion's AnimatePresence.
 *
 * Each route change triggers a quick crossfade + vertical slide. The exiting
 * page fades out while the entering page fades in and slides up slightly.
 */
export function AnimatedOutlet() {
  const outlet = useOutlet();
  const location = useLocation();

  if (!outlet) return null;

  return (
    <AnimatePresence mode='wait'>
      <m.div
        key={location.pathname}
        variants={pageVariants}
        initial='initial'
        animate='animate'
        exit='exit'
        transition={pageTransition}
      >
        {outlet}
      </m.div>
    </AnimatePresence>
  );
}
