const upstream = require("@expo/metro-config/babel-transformer");

module.exports = {
  ...upstream,
  transform: (props) =>
    upstream.transform({
      ...props,
      src: props.filename.endsWith(".injected.js")
        ? `module.exports = ${JSON.stringify(props.src + "\ntrue;")};`
        : props.src,
    }),
};
