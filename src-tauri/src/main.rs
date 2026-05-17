// Prevent additional console window on Windows in release; macOS doesn't need this.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    psygames_lib::run()
}
