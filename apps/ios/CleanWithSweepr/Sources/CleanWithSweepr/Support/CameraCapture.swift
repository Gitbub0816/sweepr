//
// Copyright © 2026–Present ClearKey Solutions, LLC.
// All Rights Reserved.
//
// Proprietary and Confidential.
//
// Unauthorized copying, modification, disclosure,
// distribution, reverse engineering, or use is prohibited.
//
import SwiftUI
#if os(iOS)
import UIKit
#endif

// Camera capture for before/after/checkout photos. iOS uses the system camera
// (UIImagePickerController) and returns JPEG data ready for the presigned R2
// upload. Kept in the app target behind os(iOS) so SweeprKit stays
// SKIP-transpilable; Android gets a CameraX divergence when SKIP re-enables.

#if os(iOS)
struct CameraCaptureView: UIViewControllerRepresentable {
    let onCapture: (Data) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            picker.sourceType = .camera
        }
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let parent: CameraCaptureView
        init(_ parent: CameraCaptureView) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            defer { parent.dismiss() }
            guard let image = info[.originalImage] as? UIImage else { return }
            // ~0.7 quality keeps typical room shots well under the 10 MB cap.
            if let data = image.jpegData(compressionQuality: 0.7) {
                parent.onCapture(data)
            }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
#endif

/// Cross-platform capture affordance: presents the camera on iOS; elsewhere it
/// explains capture is device-only (Linux verify builds, previews).
struct PhotoCaptureSheet: View {
    let onCapture: (Data) -> Void

    var body: some View {
        #if os(iOS)
        CameraCaptureView(onCapture: onCapture)
            .ignoresSafeArea()
        #else
        Text("Camera capture is available on device.")
            .padding()
        #endif
    }
}
