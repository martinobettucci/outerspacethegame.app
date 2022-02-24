# coding: utf-8
lib = File.expand_path('../lib', __FILE__)
$LOAD_PATH.unshift(lib) unless $LOAD_PATH.include?(lib)
require 'jekyll-hyperstack/version'

Gem::Specification.new do |spec|
  spec.name          = "jekyll-hyperstack"
  spec.version       = Jekyll::Hyperstack::VERSION
  spec.authors       = ["Martino BETTUCCI"]
  spec.email         = ["martino.bettucci@gmail.com"]
  spec.summary       = %q{Let Jekyll host a full client-side Hyperstack Ruby App using Opal.}
  spec.homepage      = "https://github.com/martinobettucci/outerspacethegame.app"
  spec.license       = "No Licence"

  spec.files         = `git ls-files -z`.split("\x0")
  spec.executables   = spec.files.grep(%r{^bin/}) { |f| File.basename(f) }
  spec.test_files    = spec.files.grep(%r{^(test|spec|features)/})
  spec.require_paths = ["lib"]

  spec.add_runtime_dependency "opal"
  spec.add_runtime_dependency "opal-browser"
  
  spec.add_development_dependency "bundler"
  spec.add_development_dependency "rake"
  spec.add_development_dependency "jekyll", ENV["JEKYLL_VERSION"] ? "~> #{ENV["JEKYLL_VERSION"]}" : ">= 2.0"
end
