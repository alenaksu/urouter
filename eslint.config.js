import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Files excluded from tsconfig.json (tests, root *.ts config files) use
          // tsconfig.eslint.json as fallback so type-checked rules still apply.
          allowDefaultProject: ["*.ts", "tests/*/*.ts"],
          defaultProject: "./tsconfig.eslint.json",
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
);
