// WavePicGen desktop shell. The UI is the same web app (dist/), so this entry
// point just hosts it in a native window via the system WebView.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running WavePicGen");
}
