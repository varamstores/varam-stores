import React, { useState, useEffect } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { NavigationProvider, useNavigation } from './context/NavigationContext';

// Layout & Global Components
import { AnnouncementBar } from './components/AnnouncementBar';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { CartDrawer } from './components/CartDrawer';
import { LocationModal } from './components/LocationModal';
import { ProductQuickViewModal } from './components/ProductQuickViewModal';
import { CheckoutModal } from './components/CheckoutModal';
import { AccountModal } from './components/AccountModal';
import { Preloader } from './components/Preloader';
import { ToastNotification } from './components/ToastNotification';
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from './components/transitions/PageTransition';

// Homepage Sections
import { HeroSection } from './components/HeroSection';
import { BrandMarquee } from './components/BrandMarquee';
import { CategorySection } from './components/CategorySection';
import { PromoCardsRow } from './components/PromoCardsRow';
import { ProductSection } from './components/ProductSection';
import { BakeryDairySection } from './components/BakeryDairySection';
import { FarmFreshBanner } from './components/FarmFreshBanner';
import { MostSellingSection } from './components/MostSellingSection';
import { PantrySuperfoodsSection } from './components/PantrySuperfoodsSection';
import { WhyFreshMart } from './components/WhyFreshMart';
import { BrandStory } from './components/BrandStory';
import { TrustSection } from './components/TrustSection';

// Full Pages
import { ShopCataloguePage } from './components/ShopCataloguePage';
import { ProductDetailPage } from './components/ProductDetailPage';
import { WishlistPage } from './components/WishlistPage';
import { UserAccountPage } from './components/UserAccountPage';
import { OurStoryPage } from './components/OurStoryPage';
import { AdminPortalPage } from './components/AdminPortalPage';
import { CheckoutPage } from './components/CheckoutPage';

import { useGsapScroll } from './hooks/useGsapScroll';
import type { Product } from './types';

export const AppContent: React.FC = () => {
  useGsapScroll();

  const {
    currentView,
    selectedCategory,
    selectedProductId,
    goToShop,
    goToProduct,
    goToAccount,
    goToCheckout,
  } = useNavigation();

  const [selectedPostalCode, setSelectedPostalCode] = useState('Hatfield, AL10');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
  const [selectedProductForQuickView, setSelectedProductForQuickView] = useState<Product | null>(null);

  // Always scroll to top immediately whenever navigation view changes, then refresh ScrollTrigger
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      ScrollTrigger.refresh();
    }, 50);
    return () => clearTimeout(timer);
  }, [currentView]);

  const handleSelectProductQuickView = (product: Product) => {
    setSelectedProductForQuickView(product);
  };

  const handleSelectProductDirect = (product: Product) => {
    goToProduct(product.id);
  };

  const isAdmin = currentView === 'admin';

  return (
    <div className={`min-h-screen flex flex-col bg-white text-[#18181B] w-full overflow-x-clip ${isAdmin ? '' : 'pb-14 md:pb-0'}`}>
      {/* 0. Brand Preloader Screen */}
      <Preloader />

      {/* 1. Global Fixed Full-Width Header (Hidden in Admin Portal Workspace) */}
      {!isAdmin && (
        <Header
          onOpenLocationModal={() => setIsLocationModalOpen(true)}
          selectedPostalCode={selectedPostalCode}
          onSelectProduct={handleSelectProductDirect}
          onOpenAccountModal={() => goToAccount()}
        />
      )}

      {/* 2. Main View Router (Cleared below 56px/64px fixed header) with Fluid Page Transitions */}
      <main className={isAdmin ? 'flex-1 w-full bg-[#F8FAFC]' : 'flex-1 w-full pt-14 sm:pt-16'}>
        <AnimatePresence mode="wait" initial={false}>
          {/* VIEW A: HOMEPAGE (All 15 Complete Sections) */}
          {currentView === 'home' && (
            <PageTransition key="home">
              <div className="w-full">
                {/* Announcement Bar */}
                <AnnouncementBar />

                {/* 3. Hero Section */}
                <HeroSection />

                {/* 3.5 Authentic Brands Marquee */}
                <BrandMarquee />

                {/* 4. Shop by Category Navigation: Everything You Need */}
                <CategorySection
                  selectedCategory={selectedCategory}
                  onSelectCategory={(cat) => goToShop({ category: cat })}
                />

                {/* 5. Featured Products: Today's Fresh Picks */}
                <ProductSection
                  onQuickView={handleSelectProductQuickView}
                  isWishlistFilterActive={false}
                  onClearWishlistFilter={() => { }}
                />

                {/* 6. Seasonal Bakery & Dairy Selection: Morning Bakery & Farm Dairy */}
                <BakeryDairySection onQuickView={handleSelectProductQuickView} />

                {/* 7. Curated 3 Promo Cards Row */}
                <PromoCardsRow />

                {/* 8. Farm Fresh Promotional Banner */}
                <FarmFreshBanner />

                {/* 10. Best Sellers: Most Selling Products */}
                <MostSellingSection onQuickView={handleSelectProductQuickView} />

                {/* 11. Pantry Superfoods & Seasonal Staples */}
                <PantrySuperfoodsSection onQuickView={handleSelectProductQuickView} />

                {/* 12. Why Choose FreshMart Promise */}
                <WhyFreshMart />

                {/* 13. Brand Story & Ethical Heritage */}
                <BrandStory />

                {/* 14. Customer Community & Quality Sourcing Guarantee */}
                <TrustSection />
              </div>
            </PageTransition>
          )}

          {/* VIEW B: SHOP & CATALOGUE PAGE */}
          {currentView === 'shop' && (
            <PageTransition key="shop">
              <ShopCataloguePage
                onQuickView={handleSelectProductQuickView}
                onSelectProduct={handleSelectProductDirect}
              />
            </PageTransition>
          )}

          {/* VIEW C: PRODUCT DETAIL PAGE */}
          {currentView === 'product' && (
            <PageTransition key={`product-${selectedProductId}`}>
              <ProductDetailPage
                productId={selectedProductId}
                onQuickView={handleSelectProductQuickView}
              />
            </PageTransition>
          )}

          {/* VIEW D: SAVED WISHLIST PAGE */}
          {currentView === 'wishlist' && (
            <PageTransition key="wishlist">
              <WishlistPage onQuickView={handleSelectProductQuickView} />
            </PageTransition>
          )}

          {/* VIEW E: USER ACCOUNT & PROFILE ROUTE */}
          {currentView === 'account' && (
            <PageTransition key="account">
              <UserAccountPage />
            </PageTransition>
          )}

          {/* VIEW F: DEDICATED OUR STORY PAGE */}
          {currentView === 'story' && (
            <PageTransition key="story">
              <OurStoryPage />
            </PageTransition>
          )}

          {/* VIEW G: CENTRAL STORE OPERATIONS & ADMIN PORTAL */}
          {currentView === 'admin' && (
            <PageTransition key="admin">
              <AdminPortalPage />
            </PageTransition>
          )}

          {/* VIEW H: COMPREHENSIVE FULL CHECKOUT PAGE */}
          {currentView === 'checkout' && (
            <PageTransition key="checkout">
              <CheckoutPage
                postalCode={selectedPostalCode}
                onSelectPostalCode={setSelectedPostalCode}
              />
            </PageTransition>
          )}
        </AnimatePresence>
      </main>

      {/* 4. Shared Footer (Hidden in Admin Portal Workspace) */}
      {!isAdmin && (
        <div className={currentView === 'shop' ? 'w-full lg:pl-72 xl:pl-80 transition-all duration-200' : 'w-full'}>
          <Footer />
        </div>
      )}

      {/* 5. Sticky Mobile Bottom Navigation Bar (Hidden in Admin Portal & Checkout) */}
      {!isAdmin && currentView !== 'checkout' && <MobileBottomNav />}

      {/* 6. Global Modals & Drawers */}
      <CartDrawer onCheckout={() => goToCheckout()} />

      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        selectedPostalCode={selectedPostalCode}
        onSelectPostalCode={setSelectedPostalCode}
      />

      <ProductQuickViewModal
        product={selectedProductForQuickView}
        onClose={() => setSelectedProductForQuickView(null)}
      />

      <CheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        postalCode={selectedPostalCode}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        postalCode={selectedPostalCode}
      />

      <ToastNotification />
    </div>
  );
};

export default function App() {
  return (
    <CartProvider>
      <WishlistProvider>
        <NavigationProvider>
          <AppContent />
        </NavigationProvider>
      </WishlistProvider>
    </CartProvider>
  );
}
