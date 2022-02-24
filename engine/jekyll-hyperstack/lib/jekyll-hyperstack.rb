require "jekyll-hyperstack/version"
require "jekyll/converters/opal"
require "jekyll/generators/opal"

module Jekyll
  module Hyperstack
    OPAL_LIB_LOCATION = File.join("js", "opal.js").freeze
  end
end
