import { PlayCircle, HelpCircle, ArrowRight, X } from 'lucide-react';

interface LearnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: () => void;
}

  // onAction
  // setIsLearnModalOpen(false);
  // setActiveTab('new');
  // // Smooth scroll to the upload section after a short delay
  // setTimeout(() => {
  //   const element = document.getElementById('keep-building-section');
  //   if (element) {
  //     element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  //   }
  // }, 100);

const LearnModal = ({ isOpen, onClose, onAction }: LearnModalProps) => {

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-slate-700/50 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                  <PlayCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Learn How to Use Grow With FBA AI</h3>
                  <p className="text-slate-400 text-sm">Complete platform walkthrough and tutorial</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-400 hover:text-white" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <HelpCircle className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-medium mb-2">What you'll learn:</h4>
                    <ul className="text-slate-300 text-sm space-y-1">
                      <li>• How to upload and analyze competitor data</li>
                      <li>• Understanding product vetting scores and insights</li>
                      <li>• Interpreting market analysis and competitor intelligence</li>
                      <li>• Making data-driven decisions for your FBA business</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Embedded Loom Video */}
              <div className="relative w-full" style={{ paddingBottom: '56.25%' /* 16:9 aspect ratio */ }}>
                <iframe
                  src="https://www.loom.com/embed/018f2b3c96de4f4e8f0fa0ec6c557ae5?sid=352565bc-5d64-41ac-a659-daa91f6259bf"
                  frameBorder="0"
                  allowFullScreen
                  className="absolute top-0 left-0 w-full h-full rounded-lg"
                  title="Grow With FBA AI Tutorial"
                ></iframe>
              </div>

              {/* Call to Action */}
              <div className="mt-6 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">Ready to analyze your first product?</p>
                    <p className="text-slate-400 text-sm">Upload competitor data and get instant insights</p>
                  </div>
                  <button
                    onClick={onAction}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 rounded-lg text-white font-medium transition-all transform hover:scale-105 flex items-center gap-2"
                  >
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
  );
};

export default LearnModal;