import React, { Suspense, lazy, useState, useEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';
import { AuthProvider } from './context/AuthContext';

// Layout & global
import { AnnouncementBar } from './components/AnnouncementBar';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { CartDrawer } from './components/CartDrawer';
import { LocationModal } from './components/LocationModal';
import { ProductQuickViewModal } from './components/ProductQuickViewModal';
import { Preloader } from './components/Preloader';
import { ToastNotification } from './components/ToastNotification';
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from './components/transitions/PageTransition';

// Homepage sections
import { HeroSection } from './components/HeroSection';
import { BrandMarquee } from './components/BrandMarquee';
import { CategorySection } from './components/CategorySection';
import { PromoCardsRow } from './components/PromoCardsRow';
import { ProductShelf } from './components/ProductShelf';
import { FarmFreshBanner } from './components/FarmFreshBanner';
import { WhyFreshMart } from './components/WhyFreshMart';
import { BrandStory } from './components/BrandStory';
import { TrustSection } from './components/TrustSection';

// Pages
import { ShopCataloguePage } from './components/ShopCataloguePage';
import { ProductDetailPage } from './components/ProductDetailPage';
import { WishlistPage } from './components/WishlistPage';
import { UserAccountPage } from './components/UserAccountPage';
import { OurStoryPage } from './components/OurStoryPage';
import { CheckoutPage } from './components/CheckoutPage';
import { StaticPage } from './components/StaticPage';
import { NewsletterLinkPage } from './components/NewsletterLinkPage';

import { useGsapScroll } from './hooks/useGsapScroll';
import { useCms } from './cms/CmsProvider';
import { CmsSection } from './cms/components';
import { useSeo } from './cms/hooks';
import type { CmsSectionKey } from './cms/content.gen';
import type { Product } from './types';

// The store portal is only downloaded when someone opens /admin.
const AdminApp = lazy(() => import('./admin/AdminApp'));

/** The homepage, built from the sections the admin has switched on, in the order they set. */
const HomePage: React.FC<{ onQuickView: (p: Product) => void }> = ({ onQuickView }) => {
  const cms = useCms();
  const { selectedCategory, goToShop } = useNavigation();
  useSeo('home');
  const sections: Record<string, React.ReactNode> = {
    hero: <HeroSection />,
    brands: <BrandMarquee />,
    categories: <CategorySection selectedCategory={selectedCategory} onSelectCategory={(slug) => goToShop({ category: slug })} />,
    fresh_picks: <ProductShelf shelf="fresh_picks" onQuickView={onQuickView} />,
    bakery_dairy: <ProductShelf shelf="bakery_dairy" onQuickView={onQuickView} />,
    promo_cards: <PromoCardsRow />,
    farm_banner: <FarmFreshBanner />,
    most_selling: <ProductShelf shelf="most_selling" onQuickView={onQuickView} />,
    pantry: <ProductShelf shelf="pantry" onQuickView={onQuickView} eyebrowClass="text-[#18181B]" />,
    why_us: <WhyFreshMart />,
    brand_story: <BrandStory />,
    testimonials: <TrustSection />,
  };
  return (
    <div className="w-full">
      <CmsSection k="global.announcement"><AnnouncementBar /></CmsSection>
      {cms.sectionOrder('home').filter((key) => key in sections).map((key) => (
        <CmsSection key={key} k={`home.${key}` as CmsSectionKey}>{sections[key]}</CmsSection>
      ))}
    </div>
  );
};

export const AppContent: React.FC = () => {
  useGsapScroll();
  const { currentView, selectedProductId, goToProduct, goToCheckout, pageKey, subPath } = useNavigation();
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [quickView, setQuickView] = useState<Product | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      ScrollTrigger.refresh();
    }, 50);
    return () => clearTimeout(timer);
  }, [currentView]);

  const isAdmin = currentView === 'admin';
  const openProduct = (product: Product) => goToProduct(product.slug);

  return (
    <div className={`min-h-screen flex flex-col bg-white text-[#18181B] w-full overflow-x-clip ${isAdmin ? '' : 'pb-14 md:pb-0'}`}>
      <Preloader />

      {!isAdmin && (
        <Header onOpenLocationModal={() => setIsLocationModalOpen(true)} onSelectProduct={openProduct} />
      )}

      <main id="main" className={isAdmin ? 'flex-1 w-full bg-[#F8FAFC]' : 'flex-1 w-full pt-14 sm:pt-16'}>
        <AnimatePresence mode="wait" initial={false}>
          {currentView === 'home' && (
            <PageTransition key="home">
              <HomePage onQuickView={setQuickView} />
            </PageTransition>
          )}
          {currentView === 'shop' && (
            <PageTransition key="shop">
              <ShopCataloguePage onQuickView={setQuickView} onSelectProduct={openProduct} />
            </PageTransition>
          )}
          {currentView === 'product' && (
            <PageTransition key={`product-${selectedProductId}`}>
              <ProductDetailPage productId={selectedProductId} onQuickView={setQuickView} />
            </PageTransition>
          )}
          {currentView === 'wishlist' && (
            <PageTransition key="wishlist">
              <WishlistPage onQuickView={setQuickView} />
            </PageTransition>
          )}
          {currentView === 'account' && (
            <PageTransition key="account">
              <UserAccountPage tab={subPath} />
            </PageTransition>
          )}
          {currentView === 'story' && (
            <PageTransition key="story">
              <OurStoryPage />
            </PageTransition>
          )}
          {currentView === 'admin' && (
            <PageTransition key="admin">
              <Suspense fallback={<div className="min-h-screen bg-[#18181B]" />}>
                <AdminApp />
              </Suspense>
            </PageTransition>
          )}
          {currentView === 'checkout' && (
            <PageTransition key="checkout">
              <CheckoutPage onOpenLocationModal={() => setIsLocationModalOpen(true)} />
            </PageTransition>
          )}
          {currentView === 'page' && pageKey && (
            <PageTransition key={`page-${pageKey}`}>
              <StaticPage pageKey={pageKey} />
            </PageTransition>
          )}
          {currentView === 'newsletter' && (
            <PageTransition key="newsletter">
              <NewsletterLinkPage action={subPath} />
            </PageTransition>
          )}
        </AnimatePresence>
      </main>

      {!isAdmin && (
        <div className={currentView === 'shop' ? 'w-full lg:pl-72 xl:pl-80 transition-all duration-200' : 'w-full'}>
          <Footer />
        </div>
      )}

      {!isAdmin && currentView !== 'checkout' && <MobileBottomNav />}

      <CartDrawer onCheckout={() => goToCheckout()} />
      <LocationModal isOpen={isLocationModalOpen} onClose={() => setIsLocationModalOpen(false)} />
      <ProductQuickViewModal product={quickView} onClose={() => setQuickView(null)} />
      <ToastNotification />
    </div>
  );
};

export default function App() {
  return (
    <NavigationProvider>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <AppContent />
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </NavigationProvider>
  );
}
