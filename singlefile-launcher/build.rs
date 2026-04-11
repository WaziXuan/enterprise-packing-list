use std::env;
use std::fs;
use std::path::Path;

fn quoted_path(var_name: &str) -> String {
    let raw = env::var(var_name).unwrap_or_else(|_| panic!("missing env var: {var_name}"));
    let canonical = fs::canonicalize(&raw).unwrap_or_else(|_| panic!("missing file: {raw}"));
    canonical
        .to_string_lossy()
        .trim_start_matches(r"\\?\")
        .replace('\\', "\\\\")
}

fn main() {
    let out_dir = env::var("OUT_DIR").expect("missing OUT_DIR");
    let mode = env::var("PACKING_LIST_MODE").expect("missing PACKING_LIST_MODE");
    let app_path = quoted_path("PACKING_LIST_APP_EXE");
    let runtime_path = quoted_path("PACKING_LIST_RUNTIME_EXE");
    let runtime_file_name = Path::new(&runtime_path)
        .file_name()
        .and_then(|name| name.to_str())
        .expect("invalid runtime file name")
        .to_string();

    let generated = format!(
        "pub const MODE: &str = \"{mode}\";\n\
         pub const RUNTIME_FILE_NAME: &str = \"{runtime_file_name}\";\n\
         pub static APP_EXE_BYTES: &[u8] = include_bytes!(r#\"{app_path}\"#);\n\
         pub static RUNTIME_EXE_BYTES: &[u8] = include_bytes!(r#\"{runtime_path}\"#);\n"
    );

    let output = Path::new(&out_dir).join("asset_bindings.rs");
    fs::write(output, generated).expect("failed to write generated bindings");

    println!("cargo:rerun-if-env-changed=PACKING_LIST_MODE");
    println!("cargo:rerun-if-env-changed=PACKING_LIST_APP_EXE");
    println!("cargo:rerun-if-env-changed=PACKING_LIST_RUNTIME_EXE");
}
