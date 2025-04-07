import React from 'react';
import { View, Dimensions, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

// Import Highcharts scripts directly as strings using babel-plugin-inline-import
import highchartsCore from '../highcharts-files/highcharts.hcscript';
import highstock from '../highcharts-files/highstock.hcscript';
import highchartsMore from '../highcharts-files/highcharts-more.hcscript';
import highcharts3d from '../highcharts-files/highcharts-3d.hcscript';

// Import module scripts
import boostModule from '../highcharts-files/modules/boost.hcscript';
import exportingModule from '../highcharts-files/modules/exporting.hcscript';
import solidGaugeModule from '../highcharts-files/modules/solid-gauge.hcscript';
// Import other modules as needed

// Create a module map for easy access
const MODULES = {
  boost: boostModule,
  exporting: exportingModule,
  'solid-gauge': solidGaugeModule,
  // Add other modules to the map
};

const win = Dimensions.get('window');

// HTML layout as a string
const LAYOUT_HTML = `<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=0" />
    <style>
      html, body {
        background-color: 'transparent';
      }
      #container {
        background-color: 'transparent';
        width:100%;
        height:100%;
        top:0;
        left:0;
        right:0;
        bottom:0;
        position:absolute;
        user-select: none;
        -webkit-user-select: none;
      }

      * {
          -webkit-touch-callout: none;
          -webkit-user-select: none; /* Disable selection/copy in UIWebView */
          -khtml-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
      }
    </style>
    <script>
      const hcUtils = {
          // convert string to JSON, including functions.
          parseOptions: function (chartOptions) {
              const parseFunction = this.parseFunction;

              const options = JSON.parse(chartOptions, function (val, key) {
                  if (typeof key === 'string' && key.indexOf('function') > -1) {
                      return parseFunction(key);
                  } else {
                      return key;
                  }
              });

              return options;
          },
          // convert funtion string to function
          parseFunction: function (fc) {
              const fcArgs = fc.match(/\\((.*?)\\)/)[1],
                  fcbody = fc.split('{');

              return new Function(fcArgs, '{' + fcbody.slice(1).join('{'));
          }
      };

      // Communication between React app and webview. Receive chart options as string.
      document.addEventListener('message', function (data) {
          Highcharts.charts[0].update(
            hcUtils.parseOptions(data.data),
            true,
            true,
            true
          );
      });

      window.addEventListener('message', function (data) {
          Highcharts.charts[0].update(
            hcUtils.parseOptions(data.data),
            true,
            true,
            true
          );
      });
    </script>
  </head>
  <body>
    <div id="container"></div>
  </body>
</html>`;

export default class HighchartsReactNative extends React.PureComponent {
  static getDerivedStateFromProps(props, state) {
    let width = Dimensions.get('window').width;
    let height = Dimensions.get('window').height;
    if (!!props.styles) {
      const userStyles = StyleSheet.flatten(props.styles);
      const { width: w, height: h } = userStyles;
      width = w;
      height = h;
    }
    return {
      width: width,
      height: height,
    };
  }

  constructor(props) {
    super(props);

    // Extract width and height from user styles
    const userStyles = StyleSheet.flatten(props.styles);

    this.state = {
      width: userStyles.width || win.width,
      height: userStyles.height || win.height,
      chartOptions: props.options,
      modules: props.modules || [],
      setOptions: props.setOptions || {},
      renderedOnce: false,
      useHighstock: props.useHighstock || false,
    };

    this.webviewRef = null;
  }

  componentDidUpdate() {
    this.webviewRef && this.webviewRef.postMessage(this.serialize(this.props.options, true));
  }

  componentDidMount() {
    this.setState({ renderedOnce: true });
  }

  /**
   * Convert JSON to string. When is updated, functions (like events.load)
   * is not wrapped in quotes.
   */
  serialize(chartOptions, isUpdate) {
    var hcFunctions = {},
      serializedOptions,
      i = 0;

    serializedOptions = JSON.stringify(chartOptions, function (val, key) {
      var fcId = '###HighchartsFunction' + i + '###';

      // set reference to function for the later replacement
      if (typeof key === 'function') {
        hcFunctions[fcId] = key.toString();
        i++;
        return isUpdate ? key.toString() : fcId;
      }

      return key;
    });

    // replace ids with functions.
    if (!isUpdate) {
      Object.keys(hcFunctions).forEach(function (key) {
        serializedOptions = serializedOptions.replace('"' + key + '"', hcFunctions[key]);
      });
    }

    return serializedOptions;
  }

  render() {
    const { useHighstock, setOptions, modules } = this.state;
    const chartConstructor = useHighstock ? 'stockChart' : 'chart';

    // Select the appropriate core library
    const coreScript = useHighstock ? highstock : highchartsCore;

    // Build the injected JavaScript
    const runFirst = `
      window.data = "${this.props.data ? this.props.data : null}";
      
      // Base chart library (Highcharts or Highstock)
      ${coreScript}
      
      // Highcharts More
      ${highchartsMore}
      
      // Highcharts 3D
      ${highcharts3d}
      
      // Modules
      ${modules
        .map(moduleName => {
          const moduleScript = MODULES[moduleName];
          return moduleScript
            ? `
          // ${moduleName} module
          ${moduleScript}
        `
            : '';
        })
        .join('\n')}
      
      // Set Highcharts options and render chart
      Highcharts.setOptions(${this.serialize(setOptions)});
      Highcharts.${chartConstructor}("container", ${this.serialize(this.props.options)});
    `;

    return (
      <View style={[this.props.styles, { width: this.state.width, height: this.state.height }]}>
        <WebView
          ref={ref => {
            this.webviewRef = ref;
          }}
          onMessage={this.props.onMessage ? event => this.props.onMessage(event.nativeEvent.data) : () => {}}
          source={{
            html: LAYOUT_HTML,
          }}
          injectedJavaScript={runFirst}
          originWhitelist={['*']}
          automaticallyAdjustContentInsets={true}
          allowFileAccess={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          useWebKit={true}
          scrollEnabled={false}
          mixedContentMode="always"
          allowFileAccessFromFileURLs={true}
          startInLoadingState={this.props.loader}
          style={this.props.webviewStyles}
          androidHardwareAccelerationDisabled
          renderLoading={() => (
            <View>
              <ActivityIndicator size="small" color="#dfdfdf" />
            </View>
          )}
          {...this.props.webviewProps}
        />
      </View>
    );
  }
}
