// Place this file in packages/highcharts-react-native/dist/src/HighchartsReactNative.js

import React from 'react';
import {
    View,
    Dimensions,
    StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';
import HighchartsModules from './HighchartsModules';

const win = Dimensions.get('window');

export default class HighchartsReactNative extends React.PureComponent {
    static getDerivedStateFromProps(props, state) {
        let width = Dimensions.get('window').width;
        let height =  Dimensions.get('window').height;
        if(!!props.styles) {
            const userStyles = StyleSheet.flatten(props.styles);
            const {width: w, height: h} = userStyles;
            width = w;
            height = h;
        }
        return {
            width: width,
            height: height
        };
    }
    
    constructor(props) {
        super(props);
        // extract width and height from user styles
        const userStyles = StyleSheet.flatten(props.styles);

        this.state = {
            width: userStyles.width || win.width,
            height: userStyles.height || win.height,
            chartOptions: props.options,
            useCDN: props.useCDN || true,
            modules: props.modules || [],
            setOptions: props.setOptions || {},
            renderedOnce: false,
            hcModulesReady: true  // Set to true since we'll use CDN
        };
        console.log('state', this.state)
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
                serializedOptions = serializedOptions.replace(
                    '"' + key + '"',
                    hcFunctions[key]
                );
            });
        }

        return serializedOptions;
    }
    
    render() {
        if (this.state.hcModulesReady) {
            const setOptions = this.state.setOptions;
            const modules = this.state.modules;
            
            // Create script tags for modules
            let moduleScripts = '';
            modules.forEach(module => {
                if (HighchartsModules.modules[module]) {
                    moduleScripts += `<script src="${HighchartsModules.modules[module]}"></script>`;
                }
            });
            
            // Create the HTML content
            const html = `
                <html>
                  <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=0" />
                    <style>
                        #container {
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
                            -webkit-user-select: none;
                            -khtml-user-select: none;
                            -moz-user-select: none;
                            -ms-user-select: none;
                            user-select: none;
                        }
                    </style>
                    <script src="${HighchartsModules.highstock}"></script>
                    <script src="${HighchartsModules['highcharts-more']}"></script>
                    <script src="${HighchartsModules['highcharts-3d']}"></script>
                    ${moduleScripts}
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
                            // convert function string to function
                            parseFunction: function (fc) {
                                if (!fc) return undefined;
                                
                                try {
                                    const fcArgs = fc.match(/\\((.*?)\\)/)[1],
                                          fcbody = fc.split('{');

                                    return new Function(fcArgs, '{' + fcbody.slice(1).join('{'));
                                } catch (e) {
                                    console.error('Error parsing function:', e);
                                    return function() {};
                                }
                            }
                        };

                        // Communication between React app and webview. Receive chart options as string.
                        document.addEventListener('message', function (data) {
                            if (Highcharts && Highcharts.charts && Highcharts.charts[0]) {
                                Highcharts.charts[0].update(
                                    hcUtils.parseOptions(data.data),
                                    true,
                                    true,
                                    true
                                );
                            }
                        });

                        window.addEventListener('message', function (data) {
                            if (Highcharts && Highcharts.charts && Highcharts.charts[0]) {
                                Highcharts.charts[0].update(
                                    hcUtils.parseOptions(data.data),
                                    true,
                                    true,
                                    true
                                );
                            }
                        });
                   </script>
                  </head>
                  <body>
                    <div id="container"></div>
                  </body>
                </html>
            `;

            // Run script to initialize Highcharts
            const runFirst = `
                if (window.Highcharts) {
                    Highcharts.setOptions(${this.serialize(setOptions)});
                    Highcharts.stockChart("container", ${this.serialize(this.props.options)});
                } else {
                    document.addEventListener('DOMContentLoaded', function() {
                        Highcharts.setOptions(${this.serialize(setOptions)});
                        Highcharts.stockChart("container", ${this.serialize(this.props.options)});
                    });
                }
                true;
            `;

            // Create container for the chart
            return (
                <View
                    style={[
                        this.props.styles,
                        { width: this.state.width, height: this.state.height }
                    ]}
                >
                    <WebView
                        ref={ref => {this.webviewRef = ref}}
                        onMessage={this.props.onMessage ? (event) => this.props.onMessage(event.nativeEvent.data) : () => {}}
                        source={{ html }}
                        injectedJavaScript={runFirst}
                        originWhitelist={["*"]}
                        automaticallyAdjustContentInsets={true}
                        allowFileAccess={true}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        useWebKit={true}
                        scrollEnabled={false}
                        mixedContentMode='always'
                        allowFileAccessFromFileURLs={true}
                        startInLoadingState={this.props.loader}
                        style={this.props.webviewStyles}
                        androidHardwareAccelerationDisabled={false}
                        {...this.props.webviewProps}
                    />
                </View>
            )
        } else {
            return <View></View>
        }
    }
}