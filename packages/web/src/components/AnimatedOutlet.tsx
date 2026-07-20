import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { useLocation, useOutlet } from 'react-router-dom';
import { pageVariants, viewTransition } from '../lib/motion';

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

  if (!outlet) {
    return null;
  }

  return (
    <AnimatePresence mode='wait'>
      <m.div
        className='flex-1 min-h-0'
        key={location.pathname}
        variants={pageVariants}
        initial='initial'
        animate='animate'
        exit='exit'
        transition={viewTransition}
      >
        {outlet}
      </m.div>
    </AnimatePresence>
  );
}
