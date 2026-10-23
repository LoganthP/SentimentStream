import Aurora from "../components/Aurora";
import BenchmarksSection from "../components/landing/BenchmarksSection";
import BigDataSection from "../components/landing/BigDataSection";
import DashboardPreview from "../components/landing/DashboardPreview";
import DemoSection from "../components/landing/DemoSection";
import FeaturesBento from "../components/landing/FeaturesBento";
import HeroSection from "../components/landing/HeroSection";
import LandingFooter from "../components/landing/LandingFooter";
import LandingNav from "../components/landing/LandingNav";
import PipelineSection from "../components/landing/PipelineSection";
import TechStackSection from "../components/landing/TechStackSection";

export default function Landing() {
  return (
    <div className="min-h-screen text-ink antialiased relative selection:bg-pos/20 selection:text-pos">
      {/* Mood aurora background */}
      <Aurora />

      {/* 1. Navbar */}
      <LandingNav />

      {/* Main Content Sections */}
      <main id="main">
        {/* 2. Hero with StreamCanvas */}
        <HeroSection />

        {/* 3. Try it: Interactive Classifier Demo */}
        <DemoSection />

        {/* 4. Pipeline Scrollytelling Sequence */}
        <PipelineSection />

        {/* 5. Feature Bento Grid */}
        <FeaturesBento />

        {/* 6. Big Data 4 V's */}
        <BigDataSection />

        {/* 7. Real Performance Benchmarks */}
        <BenchmarksSection />

        {/* 8. Dashboard Preview Tilted Frame */}
        <DashboardPreview />

        {/* 9. Tech Stack Strip */}
        <TechStackSection />
      </main>

      {/* 10. Final CTA Band & Academic Footer */}
      <LandingFooter />
    </div>
  );
}
